// Augment the generated `Cloudflare.Env` (from worker-configuration.d.ts) with
// secrets that don't appear in wrangler.toml. Secrets are set via:
//   pnpm --filter @coup-online/game-server exec wrangler secret put WS_SIGNING_SECRET
// or for local dev, in `apps/game-server/.dev.vars`:
//   WS_SIGNING_SECRET="some-dev-secret"

export {} // marks this file as a module so `declare global` works

declare global {
  namespace Cloudflare {
    interface Env {
      WS_SIGNING_SECRET: string
      // Optional comma-separated list of allowed Origins. Unset in dev →
      // permissive localhost / RFC 1918 matching. Set in production.
      ALLOWED_ORIGINS?: string
    }
  }
}
