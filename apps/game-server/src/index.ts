import * as Sentry from '@sentry/cloudflare'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import {
  createDb,
  deleteUserAccount,
  getAdminAuditLog,
  getAdminStats,
  getFoundingPatrons,
  insertAdminAudit,
  getLeaderboardTop100,
  getMatchById,
  getMatchParticipants,
  getRankForRating,
  getUserAccountProviders,
  getUserById,
  getUserByPatronSlug,
  getUserMatchHistory,
  getUserMatchStats,
  getUserRatingHistory,
  grantPatronage,
  isPatronSlugAvailable,
  revokePatronage,
  searchUsersByName,
  searchUsersForAdmin,
  updatePatronSettings,
  updateUserDisplayName,
  updateUserImage,
  updateUserProfileColor,
  updateUserProfileImage,
  type PatronSettingsPatch,
} from '@coup-online/db'
import { isAdminEmail, validateDisplayName } from '@coup-online/protocol'
import { conservativeRating } from '@coup-online/rating'
import { createAuth } from './auth'
import { GameRoom as GameRoomClass } from './do-game-room'
import { MatchmakingQueue as MatchmakingQueueClass } from './do-matchmaking'
import { RateLimitRegistry as RateLimitRegistryClass } from './do-rate-limit'
import { RoomCodeRegistry as RoomCodeRegistryClass } from './do-room-codes'
import { logger } from './logger'
import { isOriginAllowed } from './origin'
import { signWsToken } from './ws-token'

const app = new Hono<{ Bindings: Env }>()

// Avatar upload cap. The avatar is resized to 256×256 WebP client-side before
// upload, so the real payload is a few KB — this cap only rejects abuse.
// (Nickname rules live in packages/protocol's `validateDisplayName`.)
const AVATAR_MAX_BYTES = 1_048_576

// Patron-banner upload cap. The banner is resized to 1200×240 WebP client-
// side (see PatronageCard's onPickBanner), which typically lands at 30–120 KB.
// 2 MB allows for high-detail backgrounds without inviting abuse. Banners
// share the AVATARS R2 bucket under a `banners/` key prefix.
const BANNER_MAX_BYTES = 2_097_152

// Image-upload security. Both /api/me/avatar and /api/me/banner accept user-
// supplied bytes; serving them back as a same-origin URL means they MUST NOT
// be a vector for script execution. Defense-in-depth:
//   1. Strict Content-Type allowlist — no SVG (can host <script>), no GIF
//      (polyglot risk; also our clients always send WebP).
//   2. Magic-byte sniff — the client's Content-Type header is advisory; we
//      verify the body actually starts with the right format-id bytes.
//   3. Store + serve with the SERVER-determined content type, not the
//      client's claim.
//   4. Serve with `X-Content-Type-Options: nosniff` so legacy browsers
//      can't override the type by content-sniffing the body.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

type AllowedImageType = 'image/png' | 'image/jpeg' | 'image/webp'

// HTTP rate limiting — applied to sensitive endpoints (uploads, in-band
// patches, account-destructive actions, admin writes). State lives in the
// RateLimitRegistry DO; see src/do-rate-limit.ts. Keys are scoped
// `${userId}:${endpoint-name}` so different endpoints have independent
// budgets per user.
//
// All limits go through `checkRateLimit` so we have one place to tune; on
// rate-limit-hit we return a 429 with both a JSON body and a Retry-After
// header (in seconds, per RFC 7231).
async function checkRateLimit(
  env: Env,
  userId: string,
  endpoint: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  // Single global instance — see do-rate-limit.ts for rationale.
  const stub = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName('global'))
  return await stub.check(`${userId}:${endpoint}`, limit, windowMs)
}

// Build a 429 response with the standard headers. Retry-After is in whole
// seconds (rounded up), which is the HTTP convention.
function rateLimitResponse(
  c: Context<{ Bindings: Env }>,
  retryAfterMs: number,
) {
  return c.json(
    { error: 'rate_limited', retryAfterMs },
    429,
    {
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    },
  )
}

// Image dimension caps — decompression-bomb defence. A ~50 KB PNG can
// decode to a 100,000 × 100,000 image; ours never need anything close. The
// Worker stores raw bytes either way, but any client that decodes them
// would OOM. We reject before storage so a malicious image never reaches
// R2 in the first place.
//
// 5000 × 5000 = 25 megapixels comfortably fits everything our clients
// actually send (avatar 256×256, banner 1200×240) with room for hand-made
// uploads. Tighter than the byte cap, so a tall-thin polyglot stays caught.
const MAX_IMAGE_DIMENSION = 5000
const MAX_IMAGE_PIXELS = 25_000_000

// Read width × height from a PNG / JPEG / WebP header. Returns null if the
// header is malformed or if it's a WebP sub-format we don't recognise
// (then the caller rejects — fail safe). The byte ranges below come from
// the three format specs and have been gritty-tested against canvas-
// generated WebPs.
function parseImageDimensions(
  bytes: Uint8Array,
  type: AllowedImageType,
): { width: number; height: number } | null {
  if (type === 'image/png') {
    // PNG: 8-byte signature + 4-byte IHDR length + 4-byte 'IHDR' tag,
    // then big-endian uint32 width + height at offsets 16-23.
    if (bytes.length < 24) return null
    const width =
      ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>>
      0
    const height =
      ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>>
      0
    return { width, height }
  }
  if (type === 'image/jpeg') {
    // JPEG: walk markers from offset 2 (after SOI = FF D8) until an SOFn.
    // SOFn = FF C0..CF except C4 (DHT), C8 (JPG), CC (DAC). After the
    // marker: 2-byte length, 1-byte precision, 2-byte height, 2-byte
    // width (all big-endian).
    let pos = 2
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) return null
      const marker = bytes[pos + 1]
      const isSofMarker =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      if (isSofMarker) {
        const height = (bytes[pos + 5] << 8) | bytes[pos + 6]
        const width = (bytes[pos + 7] << 8) | bytes[pos + 8]
        return { width, height }
      }
      // Restart markers (FF D0..D7) carry no payload — skip 2 bytes.
      if (marker >= 0xd0 && marker <= 0xd7) {
        pos += 2
        continue
      }
      // Every other segment has a 2-byte big-endian length immediately
      // after the marker.
      const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3]
      if (segLen < 2) return null
      pos += 2 + segLen
    }
    return null
  }
  if (type === 'image/webp') {
    if (bytes.length < 30) return null
    // Chunk type at bytes 12-15.
    const t0 = bytes[12]
    const t1 = bytes[13]
    const t2 = bytes[14]
    const t3 = bytes[15]
    // 'VP8 ' = lossy. Width/height at 26-27 / 28-29 LE, lower 14 bits each.
    if (t0 === 0x56 && t1 === 0x50 && t2 === 0x38 && t3 === 0x20) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff
      return { width, height }
    }
    // 'VP8L' = lossless. After byte 20 (signature 0x2F), 4 bytes packed LE:
    // bits 0-13 = width-1, bits 14-27 = height-1.
    if (t0 === 0x56 && t1 === 0x50 && t2 === 0x38 && t3 === 0x4c) {
      const packed =
        bytes[21] |
        (bytes[22] << 8) |
        (bytes[23] << 16) |
        (bytes[24] << 24)
      const width = (packed & 0x3fff) + 1
      const height = ((packed >>> 14) & 0x3fff) + 1
      return { width, height }
    }
    // 'VP8X' = extended (with alpha/ICC/etc). Canvas width-1 at 24-26 LE u24,
    // canvas height-1 at 27-29 LE u24.
    if (t0 === 0x56 && t1 === 0x50 && t2 === 0x38 && t3 === 0x58) {
      const width =
        (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1
      const height =
        (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1
      return { width, height }
    }
    return null
  }
  return null
}

// Format identifier read off the first few bytes of an upload body. Returns
// null for anything we don't trust (SVG, GIF, BMP, plain bytes, polyglots).
function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  // JPEG: FF D8 FF — every JPEG starts with the SOI marker.
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg'
  }
  // WebP: "RIFF" <4-byte size> "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'image/webp'
  }
  return null
}

// Profile crest banner colors — the fixed preset palette a player can pick.
// Must stay in sync with PROFILE_COLORS in apps/web/lib/profile-colors.ts
// (that file owns the CSS values; this set is just the validation allowlist).
const PROFILE_COLOR_KEYS = new Set([
  'parchment',
  'oxblood',
  'gold',
  'forest',
  'royal',
  'purple',
])

// SKILL.md § 5 — Origin allowlist on browser-facing routes. The /api/auth/*
// and /api/ws-token paths are accessed via Next.js's `rewrites` (server-to-
// server from Vercel), so the Origin header is typically absent there and
// CORS is a no-op; Better Auth's `trustedOrigins` is what enforces CSRF.
//
// The /api/ws upgrade is browser-direct (browsers can't go through Next.js
// rewrites for WebSockets) — that's where this CORS / Origin check matters.
app.use(
  '/api/*',
  cors({
    origin: (origin, c) =>
      isOriginAllowed(origin, c.env.ALLOWED_ORIGINS ?? null) ? origin : null,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

// SKILL.md § 5 — funnel Hono route-handler errors into Sentry. Hono catches
// uncaught errors from route handlers internally and would otherwise just
// return a 500 that withSentry never observes; this hook reports them
// explicitly via the logger. It runs inside the withSentry request scope, so
// the capture routes to SENTRY_DSN_WORKER.
app.onError((err, c) => {
  logger.error('hono route handler error', err)
  return c.json({ error: 'internal_error' }, 500)
})

app.get('/health', (c) => c.json({ ok: true }))

// Better Auth catch-all (better-auth.com/docs). Mounts Better Auth's internal
// router under /api/auth/*. The browser hits these paths on the Vercel origin
// (cookies stay there); Next.js's `rewrites` proxies the request here for the
// actual handling. Set-Cookie headers flow back through the proxy.
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  return createAuth(c.env).handler(c.req.raw)
})

// WS-upgrade JWT issuance. SKILL.md § 5 — after a Better Auth session check,
// signs a 5-minute HS256 JWT with WS_SIGNING_SECRET. The Vercel rewrites
// forward POST /api/ws-token here with the browser's session cookie attached.
app.post('/api/ws-token', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  // 30 tokens per minute per user. Each WS connection consumes one; even
  // on a flaky network with auto-reconnect, 30/min is more than legitimate
  // traffic. Prevents a client (or hijacked session) from minting tokens
  // in a loop to keep DOs warm or spam the upgrade endpoint.
  const rate = await checkRateLimit(
    c.env,
    session.user.id,
    'ws-token',
    30,
    60_000,
  )
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  // Pull the user's full row so we can embed patron cosmetics in the JWT.
  // The DO uses those at seat-creation time and never has to query D1 itself,
  // keeping the per-connection hot path off D1. SKILL.md § 5 — D1 lives on
  // the Worker, not the DO.
  const db = createDb(c.env.DB)
  const me = await getUserById(db, session.user.id)
  if (!me) {
    return c.json({ error: 'user_not_found' }, 404)
  }
  // `||` (not `??`) — Better Auth may persist `name` as an empty string for
  // magic-link signups. Empty-string would propagate into the JWT and show as
  // a blank seat name in-game. trim() catches whitespace-only. The DB
  // `displayName` (project nickname) wins over the provider `name` when set.
  const displayName =
    me.displayName?.trim() ||
    session.user.name?.trim() ||
    session.user.email?.split('@')[0]?.trim() ||
    'Player'
  const token = await signWsToken(c.env.WS_SIGNING_SECRET, {
    userId: session.user.id,
    displayName,
    isPatron: me.isPatron,
    founderRank: me.founderRank,
    gildedNickname: me.patronGildedNickname,
    cardBackSkin: me.patronCardBack,
    tableTheme: me.patronTableTheme,
    victoryFlourish: me.patronVictoryFlourish,
  })
  return c.json({ token })
})

// Founding patrons — the ten Hall of Patrons slots, in founder-rank order.
// Public: patron names are public info (they appear on the leaderboard with a
// crest as well). Returns whichever of the 1–10 ranks have been filled —
// fewer than ten means the Hall keeps showing some "vacant" slots.
app.get('/api/patrons', async (c) => {
  const db = createDb(c.env.DB)
  const rows = await getFoundingPatrons(db)
  return c.json({
    patrons: rows.map((r) => ({
      userId: r.userId,
      // founderRank is non-null in this list by definition (the WHERE filters
      // it), but the TS column type is nullable — coalesce for the wire shape.
      founderRank: r.founderRank ?? 0,
      displayName: r.displayName?.trim() || r.name,
      image: r.image,
      slug: r.patronSlug,
      patronSince: r.patronSince?.getTime() ?? null,
    })),
  })
})

// Vanity-slug lookup — resolve a `patronSlug` to its userId. Public; used by
// the future /u/<slug> route on the web client to redirect to /profile/<id>.
// 404 when no patron holds the slug.
app.get('/api/patrons/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = createDb(c.env.DB)
  const me = await getUserByPatronSlug(db, slug)
  if (!me || !me.isPatron) {
    return c.json({ error: 'not_found' }, 404)
  }
  return c.json({
    userId: me.id,
    displayName: me.displayName?.trim() || me.name,
    slug: me.patronSlug,
  })
})

// PATCH the patron-controlled bits of the storefront. Better Auth
// session-gated AND patron-gated — non-patrons get 403. The body is a sparse
// patch: any subset of the editable fields. Server-side validation enforces:
//   - patronMotto: ≤ 60 chars, trimmed; null clears it.
//   - patronSlug: 3–24 chars, [a-z0-9-], must be unique; null clears it.
//   - patronCardBack / patronTableTheme: must be in the allowed preset sets
//     (CARD_BACK_SKINS / TABLE_THEMES below); null clears.
//   - patronVanityRoomCode: 4–10 chars, [A-Z0-9]; null clears.
//   - The three boolean toggles take true/false straight.
//
// Returns the new public-safe patron block on success.
const CARD_BACK_SKINS = new Set([
  'parchment', // default-equivalent (the standard back)
  'oxblood',
  'forest',
  'ivory',
])
const TABLE_THEMES = new Set([
  'standard',
  'oxblood-court',
  'forest',
  'midnight',
])
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])?$/
const VANITY_CODE_RE = /^[A-Z0-9]{4,10}$/

// Slugs a patron is NOT allowed to claim. These either collide with site
// routes (so `coups.app/u/admin` would look like it goes somewhere
// official), are project-team handles, or are generic terms an attacker
// could use to impersonate (`support`, `staff`). The list is intentionally
// short — the right time to extend is when a specific impersonation
// pattern actually shows up.
// Validate that a path parameter is a `crypto.randomUUID()`-shaped UUID
// before it touches D1 / R2. Belt-and-braces: Drizzle parameterises every
// query (no SQL-injection path) and R2 keys are server-built, so this is
// defence in depth — but it also protects against accidental misuse from
// future code that might forward path params to log lines or build keys
// without validation.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

const RESERVED_SLUGS = new Set([
  // Site route names (some prefixed by /u/, but visually misleading).
  'admin',
  'api',
  'app',
  'auth',
  'about',
  'changelog',
  'leaderboard',
  'maintenance',
  'match',
  'patrons',
  'play',
  'privacy',
  'profile',
  'room',
  'rules',
  'settings',
  'support',
  'terms',
  'u',
  // Project / brand reservations.
  't7sen',
  'coups',
  'coup',
  // Impersonation-risk terms.
  'staff',
  'team',
  'mod',
  'mods',
  'moderator',
  'help',
  // Common reserved literals.
  'null',
  'undefined',
  'true',
  'false',
])

app.patch('/api/me/patron', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) return c.json({ error: 'unauthorized' }, 401)

  const userId = session.user.id
  // 30 patches per minute. Generous because the Settings form posts the
  // full sparse-PATCH on every Save click; still tight enough to make
  // slug-squatting via rapid retries unworkable (the unique index plus this
  // limit make it ~2 seconds per attempt before retry-after triggers).
  const rate = await checkRateLimit(c.env, userId, 'patron-patch', 30, 60_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  const db = createDb(c.env.DB)
  const me = await getUserById(db, userId)
  if (!me) return c.json({ error: 'user_not_found' }, 404)
  if (!me.isPatron) return c.json({ error: 'not_a_patron' }, 403)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_body' }, 400)
  }
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'invalid_body' }, 400)
  }
  const patch = body as Record<string, unknown>
  const out: PatronSettingsPatch = {}

  // Motto: string ≤ 60 chars after trim, or null to clear.
  if ('motto' in patch) {
    const v = patch.motto
    if (v === null) {
      out.patronMotto = null
    } else if (typeof v === 'string') {
      const t = v.trim()
      if (t.length === 0) out.patronMotto = null
      else if (t.length > 60) return c.json({ error: 'motto_too_long' }, 400)
      else out.patronMotto = t
    } else {
      return c.json({ error: 'invalid_motto' }, 400)
    }
  }

  // Slug: 3–24 chars, [a-z0-9-], must be unique, must not collide with a
  // reserved name (site routes, brand, impersonation-risk terms). Null
  // clears.
  if ('slug' in patch) {
    const v = patch.slug
    if (v === null) {
      out.patronSlug = null
    } else if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      if (!SLUG_RE.test(s)) {
        return c.json({ error: 'invalid_slug' }, 400)
      }
      if (RESERVED_SLUGS.has(s)) {
        return c.json({ error: 'slug_reserved' }, 400)
      }
      // Only re-check uniqueness if the slug is changing from the current one.
      if (s !== me.patronSlug) {
        const free = await isPatronSlugAvailable(db, s)
        if (!free) return c.json({ error: 'slug_taken' }, 409)
      }
      out.patronSlug = s
    } else {
      return c.json({ error: 'invalid_slug' }, 400)
    }
  }

  // Boolean toggles.
  for (const key of [
    'gildedNickname',
    'shimmerBanner',
    'victoryFlourish',
  ] as const) {
    if (key in patch) {
      const v = patch[key]
      if (typeof v !== 'boolean') {
        return c.json({ error: `invalid_${key}` }, 400)
      }
      const mapped = (
        {
          gildedNickname: 'patronGildedNickname',
          shimmerBanner: 'patronShimmerBanner',
          victoryFlourish: 'patronVictoryFlourish',
        } as const
      )[key]
      out[mapped] = v
    }
  }

  // Card-back skin / table theme — must be in the preset set.
  if ('cardBack' in patch) {
    const v = patch.cardBack
    if (v === null) out.patronCardBack = null
    else if (typeof v === 'string' && CARD_BACK_SKINS.has(v))
      out.patronCardBack = v
    else return c.json({ error: 'invalid_cardBack' }, 400)
  }
  if ('tableTheme' in patch) {
    const v = patch.tableTheme
    if (v === null) out.patronTableTheme = null
    else if (typeof v === 'string' && TABLE_THEMES.has(v))
      out.patronTableTheme = v
    else return c.json({ error: 'invalid_tableTheme' }, 400)
  }

  // Vanity room code — 4–10 uppercase alphanumerics; null clears.
  if ('vanityRoomCode' in patch) {
    const v = patch.vanityRoomCode
    if (v === null) {
      out.patronVanityRoomCode = null
    } else if (typeof v === 'string') {
      const code = v.trim().toUpperCase()
      if (code.length === 0) out.patronVanityRoomCode = null
      else if (!VANITY_CODE_RE.test(code))
        return c.json({ error: 'invalid_vanityRoomCode' }, 400)
      else out.patronVanityRoomCode = code
    } else {
      return c.json({ error: 'invalid_vanityRoomCode' }, 400)
    }
  }

  await updatePatronSettings(db, userId, out)

  // Read back and return the merged public-facing patron block.
  const next = await getUserById(db, userId)
  if (!next) return c.json({ error: 'user_not_found' }, 404)
  return c.json({
    patron: {
      isPatron: next.isPatron,
      founderRank: next.founderRank,
      patronSince: next.patronSince?.getTime() ?? null,
      slug: next.patronSlug,
      motto: next.patronMotto,
      gildedNickname: next.patronGildedNickname,
      cardBack: next.patronCardBack,
      tableTheme: next.patronTableTheme,
      vanityRoomCode: next.patronVanityRoomCode,
      shimmerBanner: next.patronShimmerBanner,
      victoryFlourish: next.patronVictoryFlourish,
    },
  })
})

// Leaderboard — public top-100 by conservative rating (SKILL.md § 3.6).
// Read-only D1 access; the Worker owns D1, the Next.js leaderboard page
// proxies here via next.config.ts rewrites().
app.get('/api/leaderboard', async (c) => {
  const db = createDb(c.env.DB)
  const rows = await getLeaderboardTop100(db)
  return c.json({
    players: rows.map((r, i) => {
      // `played` / `wins` are NULL for users with no matches (LEFT JOIN) —
      // coalesce here. Win rate is left for the client to derive (played − wins
      // gives losses), matching how the profile page computes it.
      const played = Number(r.played ?? 0)
      const wins = Number(r.wins ?? 0)
      return {
        rank: i + 1,
        userId: r.id,
        displayName: r.displayName?.trim() || r.name,
        image: r.image,
        // Patron badge data for the leaderboard. founderRank ∈ [1, 10] gets a
        // distinct mark; isPatron alone gets the supporter crest;
        // patronGildedNickname tells the renderer to draw the name in gold.
        isPatron: r.isPatron,
        founderRank: r.founderRank,
        patronGildedNickname: r.patronGildedNickname,
        rating: conservativeRating(r.mu, r.sigma),
        played,
        wins,
      }
    }),
  })
})

// Player search — public typeahead behind the leaderboard search box.
// Case-insensitive substring match on nickname / provider name, ordered by
// conservative rating. Reached browser-side via the next.config.ts
// /api/players/* rewrite. A 2-char floor keeps the scan cheap.
app.get('/api/players/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) {
    return c.json({ players: [] })
  }
  const db = createDb(c.env.DB)
  const rows = await searchUsersByName(db, q, 20)
  return c.json({
    players: rows.map((r) => ({
      userId: r.id,
      displayName: r.displayName?.trim() || r.name,
      image: r.image,
      // Same patron badge data the full leaderboard exposes — search results
      // render with the same crest / gilded-name treatment.
      isPatron: r.isPatron,
      founderRank: r.founderRank,
      patronGildedNickname: r.patronGildedNickname,
      rating: conservativeRating(r.mu, r.sigma),
      // NULL for users with no matches (LEFT JOIN) — coalesce.
      played: Number(r.played ?? 0),
      wins: Number(r.wins ?? 0),
    })),
  })
})

// Any player's public profile — identity, rank, aggregate record, rating
// trend. Public (no session): profiles are public info (SKILL.md § 1, § 3.6).
// Deliberately omits the recent-match list — match history is participant-
// only (SKILL.md § 3.6); only the requester's own /api/me/profile includes it.
app.get('/api/profile/:userId', async (c) => {
  const userId = c.req.param('userId')
  // Reject anything that isn't a UUID before it reaches the DB.
  if (!isUuid(userId)) return c.json({ error: 'user_not_found' }, 404)
  const db = createDb(c.env.DB)
  const [me, ratingHistory, stats] = await Promise.all([
    getUserById(db, userId),
    getUserRatingHistory(db, userId, 50),
    getUserMatchStats(db, userId),
  ])
  if (!me) {
    return c.json({ error: 'user_not_found' }, 404)
  }
  const rank = await getRankForRating(db, me.mu - 3 * me.sigma)
  return c.json({
    user: {
      userId: me.id,
      displayName: me.displayName?.trim() || me.name,
      image: me.image,
      rating: conservativeRating(me.mu, me.sigma),
      rank,
      profileColor: me.profileColor,
      profileImage: me.profileImage,
    },
    stats,
    // Public-safe patron storefront subset — everything a stranger viewing the
    // profile is allowed to see. Cosmetic fields used in-game (cardBack,
    // tableTheme, vanityRoomCode, victoryFlourish) are excluded — they're
    // either owner-only preferences or specific to match contexts.
    patron: {
      isPatron: me.isPatron,
      founderRank: me.founderRank,
      patronSince: me.patronSince?.getTime() ?? null,
      slug: me.patronSlug,
      motto: me.patronMotto,
      gildedNickname: me.patronGildedNickname,
      shimmerBanner: me.patronShimmerBanner,
    },
    ratingHistory: ratingHistory.map((h) => ({
      at: h.createdAt.getTime(),
      rating: conservativeRating(h.muAfter, h.sigmaAfter),
    })),
  })
})

// The signed-in user's own profile — rating, win rate, recent match history,
// rating trend. Better Auth session-gated; match history is participant-only
// (SKILL.md § 3.6), so this returns only the requester's own record.
app.get('/api/me/profile', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const userId = session.user.id
  const db = createDb(c.env.DB)
  const [me, history, ratingHistory, stats] = await Promise.all([
    getUserById(db, userId),
    getUserMatchHistory(db, userId, 20),
    getUserRatingHistory(db, userId, 50),
    getUserMatchStats(db, userId),
  ])
  if (!me) {
    return c.json({ error: 'user_not_found' }, 404)
  }
  // Leaderboard standing — counted against the raw (unrounded) rating so it
  // matches getLeaderboardTop100's `mu - 3*sigma` sort key.
  const rank = await getRankForRating(db, me.mu - 3 * me.sigma)
  return c.json({
    user: {
      userId: me.id,
      displayName: me.displayName?.trim() || me.name,
      image: me.image,
      rating: conservativeRating(me.mu, me.sigma),
      rank,
      // Crest customization — banner color preset, plus the supporter-perk
      // custom banner image (NULL until the patron uploads one).
      profileColor: me.profileColor,
      profileImage: me.profileImage,
    },
    stats,
    // Full patron storefront — every editable field plus the read-only
    // markers. Powers the patron section in /settings.
    patron: {
      isPatron: me.isPatron,
      founderRank: me.founderRank,
      patronSince: me.patronSince?.getTime() ?? null,
      slug: me.patronSlug,
      motto: me.patronMotto,
      gildedNickname: me.patronGildedNickname,
      cardBack: me.patronCardBack,
      tableTheme: me.patronTableTheme,
      vanityRoomCode: me.patronVanityRoomCode,
      shimmerBanner: me.patronShimmerBanner,
      victoryFlourish: me.patronVictoryFlourish,
    },
    matches: history.map((m) => ({
      matchId: m.matchId,
      endedAt: m.endedAt.getTime(),
      seatCount: m.seatCount,
      finishingPosition: m.finishingPosition,
      ratingChange:
        conservativeRating(m.muAfter, m.sigmaAfter) -
        conservativeRating(m.muBefore, m.sigmaBefore),
    })),
    ratingHistory: ratingHistory.map((h) => ({
      at: h.createdAt.getTime(),
      rating: conservativeRating(h.muAfter, h.sigmaAfter),
    })),
  })
})

// Paginated match history for the dedicated /profile/[userId]/history page.
// Better Auth session-gated and participant-only by construction: the query
// always filters by the requester's session userId, so a viewer only ever sees
// matches they took part in (SKILL.md § 3.6). The profile sidebar keeps using
// the shorter `matches` slice embedded in /api/me/profile; this endpoint is
// used only when the visitor opens the full-history page.
//
// Query params:
//   limit  — clamped to [1, 100]; defaults to 50. Bad values fall back to 50
//            rather than 400-ing.
//   offset — clamped to >= 0; defaults to 0.
app.get('/api/me/matches', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const userId = session.user.id
  const limit = Math.min(
    100,
    Math.max(1, Number(c.req.query('limit') ?? 50) || 50),
  )
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0)
  const db = createDb(c.env.DB)
  const history = await getUserMatchHistory(db, userId, limit, offset)
  return c.json({
    matches: history.map((m) => ({
      matchId: m.matchId,
      startedAt: m.startedAt.getTime(),
      endedAt: m.endedAt.getTime(),
      seatCount: m.seatCount,
      finishingPosition: m.finishingPosition,
      ratingChange:
        conservativeRating(m.muAfter, m.sigmaAfter) -
        conservativeRating(m.muBefore, m.sigmaBefore),
    })),
    limit,
    offset,
  })
})

// One match's final summary — standings, per-seat rating deltas. Better Auth
// session-gated AND participant-only: match history is readable only by the
// players who were in it (SKILL.md § 3.6). A non-participant gets 403, and
// 403/404 are treated the same client-side so the match's existence stays
// private.
app.get('/api/me/matches/:matchId', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const matchId = c.req.param('matchId')
  const db = createDb(c.env.DB)
  const [match, participants] = await Promise.all([
    getMatchById(db, matchId),
    getMatchParticipants(db, matchId),
  ])
  if (!match) {
    return c.json({ error: 'match_not_found' }, 404)
  }
  if (!participants.some((p) => p.userId === session.user.id)) {
    return c.json({ error: 'forbidden' }, 403)
  }
  return c.json({
    match: {
      matchId: match.id,
      startedAt: match.startedAt.getTime(),
      endedAt: match.endedAt.getTime(),
      seatCount: match.seatCount,
      winnerUserId: match.winnerUserId,
    },
    viewerUserId: session.user.id,
    players: participants.map((p) => {
      const before = conservativeRating(p.muBefore, p.sigmaBefore)
      const after = conservativeRating(p.muAfter, p.sigmaAfter)
      return {
        userId: p.userId,
        displayName: p.displayName?.trim() || p.name,
        image: p.image,
        // Patron badge data so the summary can render the supporter crest +
        // gilded name for each seat. Subset only — full storefront isn't
        // needed here.
        isPatron: p.isPatron,
        founderRank: p.founderRank,
        patronGildedNickname: p.patronGildedNickname,
        seat: p.seat,
        finishingPosition: p.finishingPosition,
        ratingBefore: before,
        ratingAfter: after,
        ratingChange: after - before,
      }
    }),
  })
})

// Update the signed-in user's profile — nickname and/or crest banner color.
// Session-gated; reached browser-side via Next.js's /api/me/* rewrite (cookie
// flows). Both fields are optional: the inline editors on the profile page
// PATCH whichever one the user just changed. The nickname shows in-game and
// on the leaderboard (falling back to the provider name).
app.patch('/api/me/profile', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  // 30 PATCHes per minute for nickname + profileColor edits.
  const rate = await checkRateLimit(
    c.env,
    session.user.id,
    'profile-patch',
    30,
    60_000,
  )
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
  const { displayName: rawName, profileColor: rawColor } = body as {
    displayName?: unknown
    profileColor?: unknown
  }
  const db = createDb(c.env.DB)
  const result: { displayName?: string; profileColor?: string } = {}

  if (rawName !== undefined) {
    if (typeof rawName !== 'string') {
      return c.json({ error: 'bad_request' }, 400)
    }
    const displayName = rawName.trim()
    // Authoritative nickname check — length, allowed characters, profanity.
    // Shared with the web editor's instant feedback (packages/protocol).
    const check = validateDisplayName(displayName)
    if (!check.ok) {
      return c.json(
        { error: 'invalid_display_name', reason: check.error },
        400,
      )
    }
    await updateUserDisplayName(db, session.user.id, displayName)
    result.displayName = displayName
  }

  if (rawColor !== undefined) {
    if (typeof rawColor !== 'string' || !PROFILE_COLOR_KEYS.has(rawColor)) {
      return c.json({ error: 'invalid_profile_color' }, 400)
    }
    await updateUserProfileColor(db, session.user.id, rawColor)
    result.profileColor = rawColor
  }

  // Empty PATCH (neither field present) is a client bug — reject it.
  if (result.displayName === undefined && result.profileColor === undefined) {
    return c.json({ error: 'bad_request' }, 400)
  }
  return c.json(result)
})

// Upload the signed-in user's avatar. Session-gated; the request body is the
// raw image bytes (the client resizes to a small 256×256 WebP first). Stored
// in R2 under `avatars/<userId>`; user.image is set to a versioned Worker URL
// so a re-upload busts the browser cache.
app.post('/api/me/avatar', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  // 5 avatar uploads per minute. Catches accidental rapid resubmits and
  // makes "fill R2 with churn" abuse pointless.
  const rate = await checkRateLimit(c.env, session.user.id, 'avatar', 5, 60_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  // Header allowlist — the client's claim. Real verification follows.
  const claimedType = c.req.header('content-type') ?? ''
  if (!ALLOWED_IMAGE_TYPES.has(claimedType)) {
    return c.json({ error: 'unsupported_type' }, 415)
  }
  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0 || body.byteLength > AVATAR_MAX_BYTES) {
    return c.json({ error: 'invalid_size' }, 413)
  }
  // Magic-byte verify the body actually IS what the client claimed. The
  // stored content-type comes from the sniff, not the client header — so a
  // smuggled SVG with `Content-Type: image/png` is impossible.
  const fullBytes = new Uint8Array(body)
  const sniffed = sniffImageType(fullBytes)
  if (sniffed == null || sniffed !== claimedType) {
    return c.json({ error: 'content_mismatch' }, 415)
  }
  // Decompression-bomb cap — reject before the bytes touch R2.
  const dims = parseImageDimensions(fullBytes, sniffed)
  if (
    !dims ||
    dims.width <= 0 ||
    dims.height <= 0 ||
    dims.width > MAX_IMAGE_DIMENSION ||
    dims.height > MAX_IMAGE_DIMENSION ||
    dims.width * dims.height > MAX_IMAGE_PIXELS
  ) {
    return c.json({ error: 'invalid_dimensions' }, 413)
  }
  const userId = session.user.id
  await c.env.AVATARS.put(`avatars/${userId}`, body, {
    httpMetadata: { contentType: sniffed },
  })
  const image = `${new URL(c.req.url).origin}/api/avatars/${userId}?v=${Date.now()}`
  const db = createDb(c.env.DB)
  await updateUserImage(db, userId, image)
  return c.json({ image })
})

// Patron banner upload. Patron-only (403 for non-patrons). The request body
// is raw image bytes; the client resizes to 1200×240 WebP first so payloads
// are typically well under 100 KB. Stored in R2 at `banners/<userId>` in the
// shared AVATARS bucket. `user.profileImage` is set to a versioned Worker
// URL so a re-upload busts the browser cache. References this perk as
// privilege #1 on /support ("Custom profile banner").
app.post('/api/me/banner', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const userId = session.user.id
  // 5 banner uploads per minute. Same reasoning as the avatar limit; patron
  // gate doesn't replace abuse-budget protection.
  const rate = await checkRateLimit(c.env, userId, 'banner', 5, 60_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  const db = createDb(c.env.DB)
  const me = await getUserById(db, userId)
  if (!me) return c.json({ error: 'user_not_found' }, 404)
  if (!me.isPatron) return c.json({ error: 'not_a_patron' }, 403)

  // Same allowlist + magic-byte verify as the avatar endpoint. SVGs (which
  // can carry inline <script>) are excluded by the allowlist; a body that
  // doesn't pass the magic-byte sniff is rejected.
  const claimedType = c.req.header('content-type') ?? ''
  if (!ALLOWED_IMAGE_TYPES.has(claimedType)) {
    return c.json({ error: 'unsupported_type' }, 415)
  }
  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0 || body.byteLength > BANNER_MAX_BYTES) {
    return c.json({ error: 'invalid_size' }, 413)
  }
  const fullBytes = new Uint8Array(body)
  const sniffed = sniffImageType(fullBytes)
  if (sniffed == null || sniffed !== claimedType) {
    return c.json({ error: 'content_mismatch' }, 415)
  }
  const dims = parseImageDimensions(fullBytes, sniffed)
  if (
    !dims ||
    dims.width <= 0 ||
    dims.height <= 0 ||
    dims.width > MAX_IMAGE_DIMENSION ||
    dims.height > MAX_IMAGE_DIMENSION ||
    dims.width * dims.height > MAX_IMAGE_PIXELS
  ) {
    return c.json({ error: 'invalid_dimensions' }, 413)
  }
  await c.env.AVATARS.put(`banners/${userId}`, body, {
    httpMetadata: { contentType: sniffed },
  })
  const profileImage = `${new URL(c.req.url).origin}/api/banners/${userId}?v=${Date.now()}`
  await updateUserProfileImage(db, userId, profileImage)
  return c.json({ profileImage })
})

// Clear the patron banner. Patron-only. Deletes the R2 object (idempotent —
// R2 delete is a no-op if the key doesn't exist) and nulls the DB pointer
// so the profile crest falls back to the preset profileColor backdrop.
app.delete('/api/me/banner', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const userId = session.user.id
  // 10 clears per minute — wider than the upload limit since clearing is
  // cheap (R2 delete + DB null) but we still don't want a tight loop.
  const rate = await checkRateLimit(c.env, userId, 'banner-delete', 10, 60_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  const db = createDb(c.env.DB)
  const me = await getUserById(db, userId)
  if (!me) return c.json({ error: 'user_not_found' }, 404)
  // We allow the DELETE even for revoked-but-historical patrons so a stuck
  // banner can always be cleared by its owner; only the POST (upload) is
  // strictly gated on isPatron.
  await c.env.AVATARS.delete(`banners/${userId}`)
  await updateUserProfileImage(db, userId, null)
  return c.json({ ok: true })
})

// Serve a patron banner from R2. Public — banners are part of the public
// profile (SKILL.md § 1). The `?v=` query on the stored URL handles cache-
// busting, so the response itself may cache for a while. Same security
// posture as the avatar serve route (see `nosniff` rationale there).
app.get('/api/banners/:userId', async (c) => {
  const userId = c.req.param('userId')
  if (!isUuid(userId)) return c.text('Not found', 404)
  const obj = await c.env.AVATARS.get(`banners/${userId}`)
  if (!obj) {
    return c.text('Not found', 404)
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// The signed-in user's account settings — email, join date, linked sign-in
// providers. Session-gated; reached browser-side via the /api/me/* rewrite.
app.get('/api/me/account', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const db = createDb(c.env.DB)
  const [me, providers] = await Promise.all([
    getUserById(db, session.user.id),
    getUserAccountProviders(db, session.user.id),
  ])
  if (!me) {
    return c.json({ error: 'user_not_found' }, 404)
  }
  return c.json({
    userId: me.id,
    email: me.email,
    displayName: me.displayName?.trim() || me.name,
    joinedAt: me.createdAt.getTime(),
    // Empty for a magic-link-only account (no `account` row) — the client
    // renders that as "Email link".
    providers,
    // Full patron storefront — the Settings page reads this to render both
    // the read-only markers (status, founder rank, since) and the editable
    // controls (motto, slug, gilded, shimmer, victory flourish, …). Edits
    // for the in-band fields go through PATCH /api/me/patron, which returns
    // the updated block. The custom banner image is uploaded asynchronously
    // via POST /api/me/banner (the URL ends up on `profileImage`, surfaced
    // here so the UI can render the "currently set" state).
    patron: {
      isPatron: me.isPatron,
      founderRank: me.founderRank,
      patronSince: me.patronSince?.getTime() ?? null,
      slug: me.patronSlug,
      motto: me.patronMotto,
      gildedNickname: me.patronGildedNickname,
      cardBack: me.patronCardBack,
      tableTheme: me.patronTableTheme,
      vanityRoomCode: me.patronVanityRoomCode,
      shimmerBanner: me.patronShimmerBanner,
      victoryFlourish: me.patronVictoryFlourish,
      profileImage: me.profileImage,
    },
  })
})

// Delete the signed-in user's account. Anonymize, not hard-delete: the user
// row survives (as "Deleted player") because match history and the
// leaderboard reference it, but every piece of PII and every sign-in path is
// purged (see deleteUserAccount). The avatar is removed from R2 too. After
// this the client signs out and leaves.
app.delete('/api/me/account', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const userId = session.user.id
  // Tighter limit on destructive endpoint — 3 per 5 minutes. Anonymisation
  // is idempotent (the user row's already gone after the first call), so
  // re-hits are no-ops; the limit is purely defence against a stuck client
  // looping on its own success response.
  const rate = await checkRateLimit(c.env, userId, 'account-delete', 3, 300_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  const db = createDb(c.env.DB)
  await deleteUserAccount(db, userId, `deleted-${userId}@deleted.invalid`)
  // Best-effort R2 purges — both are idempotent if the object doesn't exist.
  // Avatar + patron banner share the AVATARS bucket under their respective
  // key prefixes.
  await c.env.AVATARS.delete(`avatars/${userId}`)
  await c.env.AVATARS.delete(`banners/${userId}`)
  return c.json({ ok: true })
})

// Serve an avatar from R2. Public — avatars are public info (SKILL.md § 1) —
// and loaded cross-origin by <img>. The `?v=` query on the stored URL handles
// cache-busting, so the response itself may cache for a while.
//
// Security headers:
//   - `X-Content-Type-Options: nosniff` so legacy browsers can't reinterpret
//     the body as HTML/JS via content-sniffing.
//   - The Content-Type is whatever the upload endpoint verified + stored
//     (one of png/jpeg/webp). Defends against the "polyglot smuggled HTML"
//     class of attack.
app.get('/api/avatars/:userId', async (c) => {
  const userId = c.req.param('userId')
  if (!isUuid(userId)) return c.text('Not found', 404)
  const obj = await c.env.AVATARS.get(`avatars/${userId}`)
  if (!obj) {
    return c.text('Not found', 404)
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

// ============================================================================
// Admin — gated by `isAdminEmail` against the Better Auth session email.
// ============================================================================
//
// Existence of /api/admin/* is private: the gate returns 404 (not 403) to a
// non-admin caller, so it cannot be probed to discover that the route exists.
// The web side's /admin page does the same — anyone whose email isn't in the
// allow-list gets `notFound()`. Defense in depth: the page gate prevents the
// UI from rendering, the endpoint gate prevents direct API calls.
//
// SKILL.md § 5 — admin email check goes through `isAdminEmail`, the single
// source of truth (packages/protocol/src/admin.ts).

// Admin gate. Returns the signed-in admin's userId, or null when the caller
// isn't an admin. Callers respond with 404 on null so the route's existence
// stays private.
async function checkAdmin(
  c: Context<{ Bindings: Env }>,
): Promise<string | null> {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id || !isAdminEmail(session.user.email)) return null
  return session.user.id
}

// Admin overview — totals for the admin landing strip.
app.get('/api/admin/stats', async (c) => {
  const adminId = await checkAdmin(c)
  if (!adminId) return c.json({ error: 'not_found' }, 404)
  const db = createDb(c.env.DB)
  const stats = await getAdminStats(db)
  return c.json(stats)
})

// User search across email + displayName + provider name. PII (email)
// included — admin tooling only.
app.get('/api/admin/users', async (c) => {
  const adminId = await checkAdmin(c)
  if (!adminId) return c.json({ error: 'not_found' }, 404)
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ users: [] })
  const db = createDb(c.env.DB)
  const rows = await searchUsersForAdmin(db, q, 25)
  return c.json({
    users: rows.map((r) => ({
      userId: r.id,
      email: r.email,
      displayName: r.displayName?.trim() || r.name,
      image: r.image,
      isPatron: r.isPatron,
      founderRank: r.founderRank,
      patronSince: r.patronSince?.getTime() ?? null,
      createdAt: r.createdAt.getTime(),
    })),
  })
})

// Admin audit log — newest-first, paginated. Every grant_patron /
// revoke_patron write inserts a row; this endpoint reads them back for the
// /admin page's "Audit log" section. Payload is JSON-encoded text in the
// DB; we pass it through as a parsed value when it round-trips cleanly,
// or as the raw string otherwise (never throws on bad payload).
app.get('/api/admin/audit', async (c) => {
  const adminId = await checkAdmin(c)
  if (!adminId) return c.json({ error: 'not_found' }, 404)
  const limit = Math.min(
    100,
    Math.max(1, Number(c.req.query('limit') ?? 50) || 50),
  )
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0)
  const db = createDb(c.env.DB)
  const rows = await getAdminAuditLog(db, limit, offset)
  return c.json({
    entries: rows.map((r) => {
      // Best-effort payload parse — corrupt JSON shouldn't break the read.
      let payload: unknown = null
      if (r.payload) {
        try {
          payload = JSON.parse(r.payload)
        } catch {
          payload = { raw: r.payload }
        }
      }
      return {
        id: r.id,
        adminUserId: r.adminUserId,
        adminDisplayName:
          r.adminDisplayName?.trim() || r.adminName || 'Unknown',
        action: r.action,
        targetUserId: r.targetUserId,
        targetDisplayName:
          r.targetDisplayName?.trim() || r.targetName || null,
        payload,
        createdAt: r.createdAt.getTime(),
      }
    }),
    limit,
    offset,
  })
})

// Grant patronage to a user. Idempotent (the underlying helper is). Assigns a
// founder rank automatically if there are fewer than 10 founders.
app.post('/api/admin/users/:userId/grant-patron', async (c) => {
  const adminId = await checkAdmin(c)
  if (!adminId) return c.json({ error: 'not_found' }, 404)
  // 60 admin writes per minute. Plenty for legitimate bulk action; blocks a
  // compromised admin token from doing huge damage in one window.
  const rate = await checkRateLimit(c.env, adminId, 'admin-write', 60, 60_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  const targetId = c.req.param('userId')
  if (!isUuid(targetId)) return c.json({ error: 'user_not_found' }, 404)
  const db = createDb(c.env.DB)
  const target = await getUserById(db, targetId)
  if (!target) return c.json({ error: 'user_not_found' }, 404)
  await grantPatronage(db, targetId)
  const next = await getUserById(db, targetId)
  // Audit log — append a row capturing who granted what. Payload records
  // the resulting founderRank + patronSince so a later reader can tell
  // whether this grant minted a new founder slot or was idempotent.
  await insertAdminAudit(db, {
    adminUserId: adminId,
    action: 'grant_patron',
    targetUserId: targetId,
    payload: JSON.stringify({
      founderRank: next?.founderRank ?? null,
      patronSince: next?.patronSince?.getTime() ?? null,
      wasAlreadyPatron: target.isPatron === true,
    }),
  })
  return c.json({
    userId: next?.id,
    isPatron: next?.isPatron ?? false,
    founderRank: next?.founderRank ?? null,
    patronSince: next?.patronSince?.getTime() ?? null,
  })
})

// Revoke patronage. Clears every cosmetic toggle, BUT keeps `founderRank`
// and `patronSince` so the Hall of Patrons keeps the slot. The user can be
// re-granted later without losing their founder position. We also delete
// the R2 banner object — `revokePatronage` only nulls the DB pointer; the
// R2 cleanup lives on the Worker side because R2 bindings don't reach into
// the db package.
app.post('/api/admin/users/:userId/revoke-patron', async (c) => {
  const adminId = await checkAdmin(c)
  if (!adminId) return c.json({ error: 'not_found' }, 404)
  // Shares the same admin-write budget as grant-patron — 60/min combined.
  const rate = await checkRateLimit(c.env, adminId, 'admin-write', 60, 60_000)
  if (!rate.ok) return rateLimitResponse(c, rate.retryAfterMs)
  const targetId = c.req.param('userId')
  if (!isUuid(targetId)) return c.json({ error: 'user_not_found' }, 404)
  const db = createDb(c.env.DB)
  const target = await getUserById(db, targetId)
  if (!target) return c.json({ error: 'user_not_found' }, 404)
  await revokePatronage(db, targetId)
  // Best-effort R2 cleanup — idempotent if the object doesn't exist.
  await c.env.AVATARS.delete(`banners/${targetId}`)
  const next = await getUserById(db, targetId)
  // Audit log — record the revoke. Payload preserves the founder rank
  // they're keeping (revoke leaves founderRank intact by design).
  await insertAdminAudit(db, {
    adminUserId: adminId,
    action: 'revoke_patron',
    targetUserId: targetId,
    payload: JSON.stringify({
      founderRankRetained: next?.founderRank ?? null,
      wasAlreadyNonPatron: target.isPatron === false,
    }),
  })
  return c.json({
    userId: next?.id,
    isPatron: next?.isPatron ?? false,
    founderRank: next?.founderRank ?? null,
    patronSince: next?.patronSince?.getTime() ?? null,
  })
})

// WebSocket upgrade. Worker checks Origin (early reject of cross-origin
// hijacking — SKILL.md § 5); the DO handles JWT verification, hibernation
// accept, and message dispatch.
app.get('/api/ws', async (c) => {
  if (c.req.header('upgrade') !== 'websocket') {
    return c.text('Upgrade Required', 426)
  }
  if (!isOriginAllowed(c.req.header('Origin') ?? null, c.env.ALLOWED_ORIGINS ?? null)) {
    return c.text('Forbidden', 403)
  }
  const matchId = c.req.query('matchId')
  if (!matchId || matchId.length === 0) {
    return c.text('matchId query param required', 400)
  }
  // env.GAME_ROOM is the DO namespace binding (wrangler.toml).
  // idFromName(matchId) gives a stable mapping so the same matchId always
  // routes to the same DO instance.
  const id = c.env.GAME_ROOM.idFromName(matchId)
  const stub = c.env.GAME_ROOM.get(id)
  return stub.fetch(c.req.raw)
})

// SKILL.md § 5 — Sentry on the Worker. The factory reads the DSN per-request
// from env; when SENTRY_DSN_WORKER is unset (typical local dev) the SDK
// initializes disabled and every capture no-ops. tracesSampleRate is kept low
// to stay inside the free-tier span quota; sendDefaultPii is false so user IPs
// are never shipped to Sentry (SKILL.md § 3.6 — minimal PII).
function sentryOptions(env: Env) {
  return {
    dsn: env.SENTRY_DSN_WORKER,
    // Release tag — set via wrangler at deploy time (`--var SENTRY_RELEASE=...`).
    // Unset locally → Sentry omits the tag.
    release: env.SENTRY_RELEASE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Sentry Logs product. Metrics need no flag — on by default in SDK
    // ≥ 10.25; `Sentry.metrics.*` calls wired when there's a metric to send.
    // Session Replay / User Feedback are browser-only — N/A on the Worker.
    enableLogs: true,
  }
}

// The Hono app is the fetch handler; withSentry wraps it so unhandled errors
// in HTTP routes are captured.
export default Sentry.withSentry(sentryOptions, app)

// Workers convention: re-export DO classes at the entry module so the runtime
// can instantiate them by class name as declared in wrangler.toml's
// [[durable_objects.bindings]]. Each is wrapped with Sentry DO instrumentation
// — the export name must still match the wrangler `class_name`.
export const GameRoom = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  GameRoomClass,
)
export const MatchmakingQueue = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  MatchmakingQueueClass,
)
export const RoomCodeRegistry = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  RoomCodeRegistryClass,
)
export const RateLimitRegistry = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  RateLimitRegistryClass,
)
