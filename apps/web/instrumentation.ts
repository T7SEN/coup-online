import * as Sentry from '@sentry/nextjs'

// Next.js instrumentation hook. Loads the runtime-specific Sentry config so
// the SDK initializes once per runtime before any request is handled.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in Server Components, Route Handlers, and the proxy.
export const onRequestError = Sentry.captureRequestError
