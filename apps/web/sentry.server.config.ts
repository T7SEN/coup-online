import * as Sentry from '@sentry/nextjs'

// Server-side (Node runtime) Sentry init. Loaded by instrumentation.ts's
// register() hook. SKILL.md § 5. DSN unset → SDK disabled, no-ops.
// sendDefaultPii false — no user IPs shipped (SKILL.md § 3.6).
//
// Session Replay and User Feedback are browser-only — not configured here.
// Metrics are on by default (SDK ≥ 10.25); no flag needed. Server code logs
// through lib/logger.ts, which calls Sentry.logger.* directly.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  sendDefaultPii: false,
  enableLogs: true,
})
