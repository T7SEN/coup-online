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
//   Content-Security-Policy (production only): production deploys ship a CSP
//   that locks down where the page can load scripts, styles, images, fonts,
//   and XHR/fetch/WebSocket connections from. The biggest practical wins for
//   us are connect-src (data-exfiltration block — a malicious script can't
//   POST stolen data to an attacker-controlled domain) and frame-ancestors
//   (defense-in-depth on top of X-Frame-Options). `'unsafe-inline'` stays on
//   script-src and style-src because moving to nonces requires per-request
//   middleware (deferred to v2). Dev mode skips CSP entirely — Next.js's
//   HMR injects inline scripts and uses eval(), which would either need
//   'unsafe-eval' (don't want in production) or per-mode policies (extra
//   complexity for little gain).
const isProduction = process.env.NODE_ENV === 'production'

// Worker origin — used as both connect-src HTTPS and wss:// WebSocket
// source. Falls back to the local dev port for build-time consistency, but
// since CSP is production-only the dev value is never actually emitted.
const gameServerHttp =
  process.env.NEXT_PUBLIC_GAME_SERVER_HTTP ?? 'http://127.0.0.1:8787'
const gameServerWs = gameServerHttp.replace(/^http/, 'ws')

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' on script-src is the deliberate v1 tradeoff: Next.js
  // emits a small inline hydration bootstrap. Nonces would close this but
  // require middleware. Cloudflare Web Analytics is loaded from their CDN.
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com`,
  // 'unsafe-inline' on style-src is unavoidable while using Tailwind v4 +
  // shadcn — both emit inline styles for dynamic classes (CSS variables,
  // ScrollArea sizing, etc.). Nonces don't help here even with middleware.
  `style-src 'self' 'unsafe-inline'`,
  // OAuth provider avatars come from many CDN subdomains (lh3.googleusercontent.com,
  // cdn.discordapp.com, etc.). Allowing `https:` broadly is the pragmatic
  // call — image src has minimal exfiltration value vs the maintenance cost
  // of an enumerated allowlist. `blob:` and `data:` cover client-side
  // previews (avatar / banner upload UI) and small inline SVGs.
  `img-src 'self' blob: data: https:`,
  // next/font self-hosts everything; `data:` covers a few small bundled
  // base64-encoded fonts.
  `font-src 'self' data:`,
  // The high-value directive. Only allow XHR/fetch/WebSocket to: same
  // origin (Next.js API routes + rewrites), the game-server Worker
  // (HTTPS + WSS), Sentry's ingest endpoints (us + generic for region
  // moves), and the Cloudflare Analytics beacon endpoint.
  `connect-src 'self' ${gameServerHttp} ${gameServerWs} https://*.ingest.us.sentry.io https://*.ingest.sentry.io https://cloudflareinsights.com`,
  // Clickjacking — strict 'none' on frame-ancestors complements the
  // X-Frame-Options SAMEORIGIN header above (CSP wins when both are set in
  // modern browsers; legacy clients honour X-Frame-Options).
  "frame-ancestors 'none'",
  // No third-party iframes — we don't embed payment widgets, video
  // players, or social embeds.
  "frame-src 'none'",
  // No Flash, Java applets, etc.
  "object-src 'none'",
  // <base href> tampering — if XSS lands, a malicious <base> could
  // hijack every relative link on the page. Lock to self.
  "base-uri 'self'",
  // <form action=""> targets — OAuth flows are GET-redirect-based, not
  // form submissions, so 'self' suffices.
  "form-action 'self'",
  // Forces any accidental http:// resource to upgrade to https:// at the
  // browser layer.
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()',
  },
  ...(isProduction
    ? [{ key: 'Content-Security-Policy', value: cspDirectives }]
    : []),
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
      // Public site status — drives the maintenance banner in the layout.
      // No PII, short-cached on the Worker side (60s).
      { source: '/api/site/status', destination: `${target}/api/site/status` },
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
