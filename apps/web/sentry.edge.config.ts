import * as Sentry from '@sentry/nextjs'

// Edge runtime Sentry init (edge routes / proxy). Loaded by
// instrumentation.ts's register() hook. Mirrors sentry.server.config.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  sendDefaultPii: false,
})
