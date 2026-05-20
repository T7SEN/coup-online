import * as Sentry from '@sentry/cloudflare'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  createDb,
  deleteUserAccount,
  getLeaderboardTop100,
  getMatchById,
  getMatchParticipants,
  getRankForRating,
  getUserAccountProviders,
  getUserById,
  getUserMatchHistory,
  getUserMatchStats,
  getUserRatingHistory,
  searchUsersByName,
  updateUserDisplayName,
  updateUserImage,
  updateUserProfileColor,
} from '@coup-online/db'
import { validateDisplayName } from '@coup-online/protocol'
import { conservativeRating } from '@coup-online/rating'
import { createAuth } from './auth'
import { GameRoom as GameRoomClass } from './do-game-room'
import { MatchmakingQueue as MatchmakingQueueClass } from './do-matchmaking'
import { RoomCodeRegistry as RoomCodeRegistryClass } from './do-room-codes'
import { logger } from './logger'
import { isOriginAllowed } from './origin'
import { signWsToken } from './ws-token'

const app = new Hono<{ Bindings: Env }>()

// Avatar upload cap. The avatar is resized to 256×256 WebP client-side before
// upload, so the real payload is a few KB — this cap only rejects abuse.
// (Nickname rules live in packages/protocol's `validateDisplayName`.)
const AVATAR_MAX_BYTES = 1_048_576

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
  // `||` (not `??`) — Better Auth may persist `name` as an empty string for
  // magic-link signups. Empty-string would propagate into the JWT and show as
  // a blank seat name in-game. trim() catches whitespace-only.
  const displayName =
    session.user.name?.trim() ||
    session.user.email?.split('@')[0]?.trim() ||
    'Player'
  const token = await signWsToken(c.env.WS_SIGNING_SECRET, {
    userId: session.user.id,
    displayName,
  })
  return c.json({ token })
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
      // Crest customization — banner color preset, plus the (currently always
      // null) supporter-perk custom banner image.
      profileColor: me.profileColor,
      profileImage: me.profileImage,
    },
    stats,
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
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    return c.json({ error: 'unsupported_type' }, 415)
  }
  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0 || body.byteLength > AVATAR_MAX_BYTES) {
    return c.json({ error: 'invalid_size' }, 413)
  }
  const userId = session.user.id
  await c.env.AVATARS.put(`avatars/${userId}`, body, {
    httpMetadata: { contentType },
  })
  const image = `${new URL(c.req.url).origin}/api/avatars/${userId}?v=${Date.now()}`
  const db = createDb(c.env.DB)
  await updateUserImage(db, userId, image)
  return c.json({ image })
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
  const db = createDb(c.env.DB)
  await deleteUserAccount(db, userId, `deleted-${userId}@deleted.invalid`)
  // Best-effort avatar purge — R2 delete is idempotent if there's no object.
  await c.env.AVATARS.delete(`avatars/${userId}`)
  return c.json({ ok: true })
})

// Serve an avatar from R2. Public — avatars are public info (SKILL.md § 1) —
// and loaded cross-origin by <img>. The `?v=` query on the stored URL handles
// cache-busting, so the response itself may cache for a while.
app.get('/api/avatars/:userId', async (c) => {
  const obj = await c.env.AVATARS.get(`avatars/${c.req.param('userId')}`)
  if (!obj) {
    return c.text('Not found', 404)
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp',
      'Cache-Control': 'public, max-age=604800',
    },
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
