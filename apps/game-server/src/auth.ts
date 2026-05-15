import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
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
      // explicit for clarity.
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
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
      magicLink({
        // Better Auth doesn't ship an emailer. We send via Resend's REST API
        // directly — no SDK, just fetch.
        sendMagicLink: async ({ email, url }) => {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: env.RESEND_FROM,
              to: email,
              subject: 'Your Coup Online sign-in link',
              html: magicLinkEmail(url),
              text: `Sign in to Coup Online: ${url}`,
            }),
          })
          if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(`Resend send failed: ${res.status} ${body}`)
          }
        },
      }),
    ],
  })
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
}

export async function verifyJwt(secret: string, token: string): Promise<JwtClaims | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] })
    if (typeof payload.userId !== 'string' || typeof payload.displayName !== 'string') {
      return null
    }
    return { userId: payload.userId, displayName: payload.displayName }
  } catch {
    return null
  }
}
