import * as Sentry from '@sentry/nextjs'

// Browser Sentry init — Next.js loads this on every page. SKILL.md § 5.
// DSN unset → SDK disabled, no-ops.
//
// Enabled: error monitoring, tracing (Performance Monitoring), structured
// Logs, Session Replay, and the User Feedback widget. Metrics need no init
// flag — they're on by default in SDK ≥ 10.25 (only `enableMetrics: false`
// disables them); the `Sentry.metrics.*` calls get wired when there's a
// metric worth tracking.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  sendDefaultPii: false,
  // Sentry Logs product.
  enableLogs: true,
  integrations: [
    // Session Replay. The defaults already mask all text / inputs / media —
    // set explicitly here as the documented privacy posture (SKILL.md § 3.6).
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    // User Feedback — floating "report a bug" widget.
    Sentry.feedbackIntegration({ colorScheme: 'system' }),
  ],
  // Session Replay sampling: record every session that hits an error, plus a
  // very small slice of ordinary sessions. The free-tier replay quota is
  // small — error-biased sampling spends it where it matters.
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.01,
})

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
