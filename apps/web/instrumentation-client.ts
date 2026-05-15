import * as Sentry from '@sentry/nextjs'

// Browser Sentry init — Next.js loads this on every page. SKILL.md § 5.
//
// Error monitoring only: no Session Replay and no User Feedback integration,
// to keep the client bundle lean and reserve the free-tier quota for actual
// errors. DSN unset → SDK disabled, no-ops.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  sendDefaultPii: false,
})

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
