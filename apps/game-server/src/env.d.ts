// Augment the generated `Cloudflare.Env` (from worker-configuration.d.ts) with
// secrets that don't appear in wrangler.toml. Secrets are set via:
//   pnpm --filter @coup-online/game-server exec wrangler secret put <NAME>
// or for local dev, in `apps/game-server/.dev.vars`:
//   <NAME> = "..."
//
// Better Auth runs on the Worker (SKILL.md § 2 — D1 stays Worker-owned),
// so every auth secret lives here. The Vercel side only needs the public
// game-server URL; no auth secrets there.

export {} // marks this file as a module so `declare global` works

declare global {
  namespace Cloudflare {
    interface Env {
      // SKILL.md § 5 — HS256 secret shared with Next.js? No — only the Worker
      // signs (in /api/ws-token) and verifies (in GameRoom.fetch). Same
      // 5-minute, { userId, displayName } JWT shape as before.
      WS_SIGNING_SECRET: string

      // Better Auth core (better-auth.com/docs).
      BETTER_AUTH_SECRET: string
      BETTER_AUTH_URL: string

      // OAuth providers.
      GOOGLE_CLIENT_ID: string
      GOOGLE_CLIENT_SECRET: string
      DISCORD_CLIENT_ID: string
      DISCORD_CLIENT_SECRET: string

      // Resend (magic-link plugin sends through Resend's REST API).
      RESEND_API_KEY: string
      RESEND_FROM: string

      // Comma-separated production origins. Used by both:
      //   - the WS-upgrade Origin allowlist (apps/game-server/src/origin.ts)
      //   - Better Auth's trustedOrigins
      // Unset → dev-permissive (localhost + RFC 1918 ranges).
      ALLOWED_ORIGINS?: string
    }
  }
}
