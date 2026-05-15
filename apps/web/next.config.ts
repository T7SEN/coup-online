import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

// Better Auth lives on the Worker (SKILL.md § 2 — D1 stays Worker-owned).
// Browsers hit /api/auth/* and /api/ws-token on the Vercel origin so cookies
// scope to that origin; Next.js then proxies the request server-side to the
// Worker. Set-Cookie headers from the Worker flow back through this rewrite
// and apply to the browser's view of the Vercel origin.
const nextConfig: NextConfig = {
  async rewrites() {
    const target =
      process.env.NEXT_PUBLIC_GAME_SERVER_HTTP ?? 'http://127.0.0.1:8787'
    return [
      { source: '/api/auth/:path*', destination: `${target}/api/auth/:path*` },
      { source: '/api/ws-token', destination: `${target}/api/ws-token` },
    ]
  },
}

// SKILL.md § 5 — Sentry error monitoring. `withSentryConfig` adds build-time
// instrumentation. org / project / authToken drive source-map upload and are
// optional: when unset, upload is skipped and runtime error capture still
// works off NEXT_PUBLIC_SENTRY_DSN (set in the Sentry init files). `silent`
// quiets the upload logs outside CI.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
})
