import * as Sentry from '@sentry/nextjs'

// Server-side (Node runtime) Sentry init. Loaded by instrumentation.ts's
// register() hook. SKILL.md § 5 — error monitoring on both ends.
//
// DSN unset (local dev without Sentry configured) → the SDK initializes in a
// disabled state and every capture call no-ops. sendDefaultPii is false so
// user IPs are never shipped to Sentry (SKILL.md § 3.6 — minimal PII).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  sendDefaultPii: false,
})
