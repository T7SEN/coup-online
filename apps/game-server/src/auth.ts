import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { passkey } from '@better-auth/passkey'
import { createDb } from '@coup-online/db'
import * as schema from '@coup-online/db'
import { jwtVerify } from 'jose'

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
            await sendResendEmail(env, {
              to: user.email,
              subject: 'Your Coup Online verification code',
              html: twoFactorOtpEmail(otp),
              text: `Your Coup Online verification code is: ${otp}\n\nThe code expires in 3 minutes.`,
            })
          },
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendResendEmail(env, {
            to: email,
            subject: 'Your Coup Online sign-in link',
            html: magicLinkEmail(url),
            text: `Sign in to Coup Online: ${url}`,
          })
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
        origin: env.BETTER_AUTH_URL.replace(/\/$/, ''),
      }),
    ],
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

// Minimal HTML body. Intentionally inline — no template engine, no images,
// no marketing. The user clicked "send me a link"; this is the link.
function magicLinkEmail(url: string): string {
  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5;">
  <h2>Sign in to Coup Online</h2>
  <p>Click the link below to sign in. It expires in a few minutes and only works once.</p>
  <p><a href="${url}" style="color: #2563eb;">${url}</a></p>
  <p style="color: #6b7280; font-size: 0.875rem;">If you didn't request this, you can ignore the email.</p>
</body></html>`
}

// 2FA email-OTP body. Same minimalist treatment as the magic link: no
// images, no marketing. The code is rendered large and monospaced so it's
// easy to read across mail clients. If the user didn't request it, the
// last line tells them what to do.
function twoFactorOtpEmail(code: string): string {
  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5;">
  <h2>Your Coup Online verification code</h2>
  <p>Enter this code on the verification page to finish signing in:</p>
  <p style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.75rem; font-weight: 600; letter-spacing: 0.25em; color: #111;">${code}</p>
  <p style="color: #6b7280; font-size: 0.875rem;">The code expires in 3 minutes. If you didn't request it, you can ignore this email — but if it keeps arriving, change your sign-in method from your account settings.</p>
</body></html>`
}

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
