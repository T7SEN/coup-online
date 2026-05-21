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
// Baseline security headers applied to every response served by Next.js.
// Defense in depth — Cloudflare (Vercel edge / WAF) already handles TLS and
// some of these, but we set them at the origin too so misconfiguration up
// the chain doesn't leave us exposed.
//
//   X-Content-Type-Options: nosniff — every response is interpreted with
//   the Content-Type the server set, not whatever a legacy browser guesses
//   from sniffing the body. Defends against polyglot HTML/JS files smuggled
//   inside non-HTML responses.
//
//   X-Frame-Options: SAMEORIGIN — Coup Online must not be embedded by other
//   sites (clickjacking class). The site itself can iframe its own routes.
//
//   Referrer-Policy: strict-origin-when-cross-origin — leak only the origin
//   to other sites, never the full path / query. Match-codes and admin URLs
//   stay out of third-party referrers.
//
//   Permissions-Policy: deny everything we don't use. Future features can
//   relax specific entries here.
//
// CSP is NOT set here — it's brittle to roll out without a per-page audit
// of what scripts/styles/connects are needed. Document for a separate hardening
// pass: `Content-Security-Policy` with self / hashed-inline-only.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  // Drop the default `X-Powered-By: Next.js` response header. Tiny info-
  // disclosure win — advertising the stack and version makes targeted CVE
  // probing slightly easier. Costs nothing to omit.
  poweredByHeader: false,
  // Bridge a release tag into the client + server Sentry inits so events
  // are attributed to a specific deploy.
  //
  // Resolution order:
  //   1. NEXT_PUBLIC_SENTRY_RELEASE — explicit override (e.g. from a CI
  //      run that wants to label the release manually).
  //   2. VERCEL_GIT_COMMIT_SHA — Vercel injects this on every build, no
  //      dashboard config needed.
  //   3. undefined locally — Sentry simply omits the release tag, which
  //      is the desired behaviour for dev events.
  env: {
    NEXT_PUBLIC_SENTRY_RELEASE:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
      process.env.VERCEL_GIT_COMMIT_SHA,
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
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
      // Patron storefront — public Hall of Patrons list + the slug lookup,
      // both reached by Server Components (and the Hall page from the
      // browser, eventually).
      { source: '/api/patrons', destination: `${target}/api/patrons` },
      {
        source: '/api/patrons/:path*',
        destination: `${target}/api/patrons/:path*`,
      },
      // Admin tools — gated server-side by `isAdminEmail` (see
      // packages/protocol/src/admin.ts). Existence is private: a non-admin
      // caller gets 404 from the Worker, same as the /admin page itself.
      {
        source: '/api/admin/:path*',
        destination: `${target}/api/admin/:path*`,
      },
      // Patron banner image serving. Public — banners are part of the
      // public profile (the upload endpoint at /api/me/banner is already
      // covered by /api/me/* above).
      {
        source: '/api/banners/:path*',
        destination: `${target}/api/banners/:path*`,
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
