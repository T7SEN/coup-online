import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import { magicLink } from 'better-auth/plugins/magic-link'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { passkey } from '@better-auth/passkey'
import { createDb } from '@coup-online/db'
import * as schema from '@coup-online/db'
import { jwtVerify } from 'jose'
import { magicLinkEmail, twoFactorOtpEmail } from './emails'

// Better Auth lives on the Worker (SKILL.md § 2 — D1 is Worker-exclusive).
// The Drizzle adapter binds directly to `env.DB`; there is no HTTP-DB bridge.
//
// `createAuth(env)` is invoked per-request because Workers expose env on the
// request boundary, not at module-load time. Better Auth caches enough
// internal state to keep this cheap. See references/auth.md.

export function createAuth(env: Env) {
  const db = createDb(env.DB)
  const trustedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return betterAuth({
    appName: 'Coup Online',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // CSRF protection. Production: comma-separated allowlist. Dev: include
    // localhost + Next.js's LAN URL (Next.js auto-binds 0.0.0.0). The
    // origin.ts allowlist for /api/ws is independent of this.
    trustedOrigins:
      trustedOrigins.length > 0
        ? trustedOrigins
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // Map Better Auth's expected model names to our Drizzle exports.
      // packages/db/src/schema.ts uses singular exports (`user`, `session`,
      // `account`, `verification`) so this map is a passthrough — kept
      // explicit for clarity. `twoFactor` + `rateLimit` are the tables the
      // matching Better Auth plugins read/write.
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
        passkey: schema.passkey,
      },
    }),
    // Built-in rate limiting on /api/auth/*. Storage MUST be 'database' on
    // Workers — in-memory state doesn't survive between Worker invocations
    // and isn't shared across edge instances. Custom rules tighten the
    // brute-force-prone endpoints; defaults stay generous for ordinary
    // session reads. `enabled: true` overrides Better Auth's default of
    // "only enabled in production".
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        // Magic-link send — the inbox-spam vector. 3 per minute is enough
        // for retries / typos and blocks a flood.
        '/sign-in/magic-link': { window: 60, max: 3 },
        // OAuth start — limit kicked redirect loops.
        '/sign-in/social': { window: 60, max: 10 },
        // Magic-link verify — same window as send; tight to slow brute force.
        '/magic-link/verify': { window: 60, max: 10 },
        // 2FA verify — must be tight to defeat 6-digit code brute force.
        // All three challenge modes share the same 5/min ceiling.
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/verify-otp': { window: 60, max: 5 },
        // Email-OTP send is the other inbox-spam vector; matches the
        // magic-link ceiling. Note this is per-IP (Better Auth's default),
        // so a real user retrying from their phone won't be locked out by
        // someone else hammering the endpoint.
        '/two-factor/send-otp': { window: 60, max: 3 },
        // Passkey (WebAuthn) endpoints. The ceremony itself is two round
        // trips (generate options → verify), and a misbehaving client
        // shouldn't be able to flood the challenge generator. 10/min
        // covers a real user retrying a failed scan a couple of times
        // and stops a script.
        '/passkey/generate-register-options': { window: 60, max: 10 },
        '/passkey/verify-registration': { window: 60, max: 10 },
        '/passkey/generate-authenticate-options': { window: 60, max: 10 },
        '/passkey/verify-authentication': { window: 60, max: 10 },
        // List / mutate are session-gated already; loose ceiling.
        '/passkey/list-user-passkeys': { window: 60, max: 30 },
        '/passkey/delete-passkey': { window: 60, max: 10 },
        '/passkey/update-passkey': { window: 60, max: 10 },
      },
    },
    // SKILL.md § 5 — DB-backed sessions with a 60-second cookie cache to
    // skip per-request DB lookups for hot reads (the typical case during
    // gameplay). Tradeoff: session revocation propagates up to 60s after
    // the row is deleted.
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60,
      },
    },
    // Account linking — one identity per person. When a user signs in with
    // Google AND Discord using the same email, Better Auth links the new
    // OAuth account to the existing user row instead of refusing on the
    // email UNIQUE constraint. `trustedProviders` lists providers whose
    // email-verified claim we trust (Google and Discord both verify;
    // anything else would need explicit confirmation to link).
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'discord'],
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
      },
    },
    // Ensure `user.name` is never empty. Better Auth's OAuth providers map
     // `profile.name` → `user.name` automatically, but the magic-link plugin
     // has no provider name to copy from, so without this hook the column
     // gets an empty string. Falling back to the email's local part gives a
     // sensible default; users can change `displayName` later (separate
     // column reserved for an onboarding flow).
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const provided =
              typeof user.name === 'string' ? user.name.trim() : ''
            if (provided.length > 0) {
              return { data: { ...user, name: provided } }
            }
            const fallback =
              user.email?.split('@')[0]?.trim().slice(0, 40) || 'Player'
            return { data: { ...user, name: fallback } }
          },
        },
      },
    },
    plugins: [
      // 2FA. `allowPasswordless: true` is critical — our users have OAuth /
      // magic-link accounts only (no credential row), so the default
      // password-verification gate would lock them out of enabling 2FA at
      // all. `skipVerificationOnEnable` defaults to false: the plugin
      // requires the user to prove they can read the TOTP secret (via a
      // verifyTotp call with a code from their authenticator) before 2FA is
      // enforced on sign-ins. Backup codes ship by default.
      //
      // Three challenge methods coexist once a user is enrolled:
      //   1. TOTP — code from authenticator app (primary, strongest)
      //   2. Email OTP — 6-digit code sent via Resend (otpOptions below)
      //   3. Backup code — one-time recovery codes saved at enrolment
      //
      // The client picks one at challenge time; the server enforces the
      // rate-limit ceilings in `customRules` above.
      twoFactor({
        issuer: 'Coup Online',
        allowPasswordless: true,
        otpOptions: {
          // Better Auth defaults: 6 digits, 3-minute TTL. Explicit so we
          // don't drift if the upstream defaults change. The user expects
          // the email code to behave like the TOTP code shape (6 digits).
          period: 3,
          digits: 6,
          // Triggered by `authClient.twoFactor.sendOtp()` mid-challenge.
          // `user` is the row in mid-2FA-challenge; `otp` is the freshly
          // generated 6-digit code Better Auth has already stored in the
          // verification table. We just need to deliver it.
          sendOTP: async ({ user, otp }) => {
            const { subject, html, text } = twoFactorOtpEmail(otp)
            await sendResendEmail(env, { to: user.email, subject, html, text })
          },
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const { subject, html, text } = magicLinkEmail(url)
          await sendResendEmail(env, { to: email, subject, html, text })
        },
      }),
      // Passkeys / WebAuthn (`@better-auth/passkey`). Adds a `passkey`
      // table (one row per enrolled credential) and seven endpoints under
      // /api/auth/passkey/* for the WebAuthn ceremony. The plugin uses
      // @simplewebauthn under the hood — Workers-compatible (Web Crypto).
      //
      // rpID / origin are derived from BETTER_AUTH_URL: in prod that's
      // https://coups.app (rpID=coups.app, origin=https://coups.app); in
      // dev http://localhost:3000 (rpID=localhost, origin=http://localhost:
      // 3000). The browser pins the credential to this rpID, so it must
      // match the page origin or the user agent rejects the ceremony.
      //
      // Signing in with a passkey produces a full session and skips the
      // 2FA challenge — that's correct: WebAuthn is inherently multi-
      // factor (device possession + biometric/PIN). Users who want to
      // pair a passkey WITH 2FA can simply not register the passkey.
      passkey({
        rpName: 'Coup Online',
        rpID: rpIdFromUrl(env.BETTER_AUTH_URL),
        // WebAuthn's `origin` MUST be the page origin (scheme + host[:port]) —
        // no path. SimpleWebAuthn compares this against the browser's
        // `clientDataJSON.origin` byte-for-byte; a trailing `/api/auth`
        // breaks verification with FAILED_TO_VERIFY_REGISTRATION (500).
        // `URL.origin` is the right accessor — `https://coups.app/api/auth`
        // → `https://coups.app`.
        origin: new URL(env.BETTER_AUTH_URL).origin,
      }),
    ],
    // 2FA enforcement on OAuth + magic-link sign-ins. Better Auth's
    // twoFactor plugin only hooks `/sign-in/email|username|phone-number`
    // — see plugins/two-factor/index.mjs. Our users sign in exclusively
    // via Google, Discord, and magic link, so without this hook the
    // plugin is effectively dormant: enabling 2FA in /settings would
    // never produce a challenge.
    //
    // The shape mirrors the plugin's own hook: read `newSession`, bail if
    // 2FA isn't enabled for that user, otherwise tear down the freshly-
    // issued session, set the partial `two_factor` cookie that the
    // /two-factor/verify-* endpoints recognise, and redirect the browser
    // to /auth/two-factor. The original callback URL flows through as
    // `?next=` so the user lands where they expected after verification.
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        // Only fire for the paths the plugin's built-in hook misses.
        // Passkey sign-in (/passkey/verify-authentication) is intentionally
        // NOT covered — passkeys are inherently multi-factor, so 2FA on top
        // would be redundant.
        const path = ctx.path
        const isOAuthCallback = path.startsWith('/callback/')
        const isMagicLinkVerify = path === '/magic-link/verify'
        if (!isOAuthCallback && !isMagicLinkVerify) return

        const data = ctx.context.newSession
        if (!data?.user.twoFactorEnabled) return

        // Drop the just-issued full session — the user hasn't proved the
        // second factor yet, so it must not be usable.
        deleteSessionCookie(ctx, true)
        await ctx.context.internalAdapter.deleteSession(data.session.token)

        // Issue the partial-session cookie the twoFactor plugin's verify
        // endpoints expect. Same cookie name and verification-record shape
        // it would create on /sign-in/email so the existing verifyTotp /
        // verifyOtp / verifyBackupCode endpoints "just work".
        const maxAge = 600
        const twoFactorCookie = ctx.context.createAuthCookie(
          'two_factor',
          { maxAge },
        )
        const identifier = `2fa-${generateRandomString(20)}`
        await ctx.context.internalAdapter.createVerificationValue({
          value: data.user.id,
          identifier,
          expiresAt: new Date(Date.now() + maxAge * 1000),
        })
        await ctx.setSignedCookie(
          twoFactorCookie.name,
          identifier,
          ctx.context.secret,
          twoFactorCookie.attributes,
        )

        // Redirect to the 2FA challenge page. For OAuth, the original
        // callbackURL the client passed to signIn.social is in the OAuth
        // state — Better Auth surfaces it on the response when it would
        // normally redirect. We can't easily extract it from our position
        // in the hook, so we default to /auth/callback (which closes the
        // popup and signals success) and let the page's `next` query
        // override if present.
        //
        // The right way to redirect from a Better Auth after-hook is to
        // `throw ctx.redirect(url)` — better-call's `redirect()` creates
        // a 302 APIError with the Location header, and the after-hook
        // framework's APIError catch translates that into the actual HTTP
        // redirect response (overriding the OAuth callback's default
        // redirect to the original callbackURL). Returning a raw
        // `new Response(...)` does NOT work — the framework treats hook
        // returns as `{ response, headers }` shape and silently drops
        // anything else.
        const base = new URL(env.BETTER_AUTH_URL).origin
        const next = (typeof ctx.query?.callbackURL === 'string'
          ? ctx.query.callbackURL
          : '/auth/callback')
        const redirectTo = `${base}/auth/two-factor?next=${encodeURIComponent(next)}`
        throw ctx.redirect(redirectTo)
      }),
    },
  })
}

// Derive the WebAuthn Relying Party ID from a full auth URL — the spec
// wants a registrable domain (or 'localhost' for dev), never the
// scheme or port. URL parsing is the safe path: 'https://coups.app'
// → 'coups.app'; 'http://localhost:3000' → 'localhost'.
function rpIdFromUrl(authUrl: string): string {
  try {
    return new URL(authUrl).hostname
  } catch {
    // Belt-and-braces fallback for misconfigured envs in dev. The plugin
    // default is 'localhost' too.
    return 'localhost'
  }
}

// Shared Resend transport. Both magic-link and 2FA email-OTP send through
// here. Better Auth doesn't ship an emailer; we hit Resend's REST API
// directly — no SDK, just fetch. Throws on non-2xx so Better Auth surfaces
// the failure back to the caller (the client shows a toast).
async function sendResendEmail(
  env: Env,
  payload: { to: string; subject: string; html: string; text: string },
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend send failed: ${res.status} ${body}`)
  }
}

// Email templates live in ./emails.ts — Renaissance-court branded HTML with
// plain-text alternatives, dark-mode media query, and Outlook-safe
// table-based layout. Imported as `magicLinkEmail` / `twoFactorOtpEmail` at
// the top of this file.

// ============================================================================
// WS-upgrade JWT verification (separate from Better Auth sessions).
// ============================================================================
//
// SKILL.md § 5 — every WS upgrade verifies this 5-minute JWT, signed with
// WS_SIGNING_SECRET. Sign side lives in apps/game-server/src/ws-token.ts;
// Next.js does NOT sign WS tokens anymore — the /api/ws-token Worker route
// does, after a Better Auth session check.

const ALG = 'HS256'

export interface JwtClaims {
  readonly userId: string
  readonly displayName: string
  // Patron cosmetics — present only if the user was a patron at token-issue
  // time. Absent / undefined for non-patrons (most claims). See ws-token.ts
  // for the issuance side.
  readonly isPatron?: boolean
  readonly founderRank?: number | null
  readonly gildedNickname?: boolean
  readonly cardBackSkin?: string | null
  readonly tableTheme?: string | null
  readonly victoryFlourish?: boolean
}

// Narrow `unknown` JWT payload values to optional patron fields. The token
// is signed by us so the shape is trusted, but TypeScript still needs the
// guards — and the guards keep us honest if a future deploy lands with a
// stale token in flight.
function asOptBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}
function asOptNullableNumber(v: unknown): number | null | undefined {
  if (v === null) return null
  return typeof v === 'number' ? v : undefined
}
function asOptNullableString(v: unknown): string | null | undefined {
  if (v === null) return null
  return typeof v === 'string' ? v : undefined
}

export async function verifyJwt(secret: string, token: string): Promise<JwtClaims | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] })
    if (typeof payload.userId !== 'string' || typeof payload.displayName !== 'string') {
      return null
    }
    return {
      userId: payload.userId,
      displayName: payload.displayName,
      isPatron: asOptBool(payload.isPatron),
      founderRank: asOptNullableNumber(payload.founderRank),
      gildedNickname: asOptBool(payload.gildedNickname),
      cardBackSkin: asOptNullableString(payload.cardBackSkin),
      tableTheme: asOptNullableString(payload.tableTheme),
      victoryFlourish: asOptBool(payload.victoryFlourish),
    }
  } catch {
    return null
  }
}
