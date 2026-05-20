import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

// D1 is Worker-owned (SKILL.md § 2), so every server route the browser needs
// is proxied to the Worker. Browsers hit these on the Vercel origin (cookies
// scope there); Next.js proxies them server-side, and Set-Cookie headers from
// the Worker flow back through. Routes:
//   /api/auth/*                  — Better Auth.
//   /api/ws-token                — the short-lived WS JWT.
//   /api/leaderboard, /api/me/*  — read-only D1-backed data (leaderboard +
//                                  the signed-in user's profile).
//   /api/players/*               — leaderboard player search (browser-side).
const nextConfig: NextConfig = {
  async rewrites() {
    const target =
      process.env.NEXT_PUBLIC_GAME_SERVER_HTTP ?? 'http://127.0.0.1:8787'
    return [
      { source: '/api/auth/:path*', destination: `${target}/api/auth/:path*` },
      { source: '/api/ws-token', destination: `${target}/api/ws-token` },
      { source: '/api/leaderboard', destination: `${target}/api/leaderboard` },
      { source: '/api/me/:path*', destination: `${target}/api/me/:path*` },
      {
        source: '/api/players/:path*',
        destination: `${target}/api/players/:path*`,
      },
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
