import * as Sentry from '@sentry/nextjs'

// Web logger — SKILL.md § 5. The single diagnostics chokepoint: call sites
// never use raw `console.*`. `info` / `warn` / `error` route to the Sentry
// Logs product; `error` additionally opens a Sentry Issue when given an
// exception. In development they also mirror to the browser console for local
// visibility; in production they go to Sentry only (no browser-console
// clutter). `debug` is dev-console-only and never shipped to Sentry.
//
// This module is the one sanctioned place for `console.*` — it IS the logger.
//
// `attributes` are restricted to primitives so the same object is valid both
// as Sentry log attributes (queryable) and as Issue tags (filterable).

export type LogAttributes = Record<string, string | number | boolean>

const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  debug(message: string, attributes?: LogAttributes): void {
    if (isDev) console.debug(message, attributes ?? '')
  },
  info(message: string, attributes?: LogAttributes): void {
    if (isDev) console.info(message, attributes ?? '')
    Sentry.logger.info(message, attributes)
  },
  warn(message: string, attributes?: LogAttributes): void {
    if (isDev) console.warn(message, attributes ?? '')
    Sentry.logger.warn(message, attributes)
  },
  error(message: string, error?: unknown, attributes?: LogAttributes): void {
    if (isDev) console.error(message, error ?? '', attributes ?? '')
    Sentry.logger.error(message, attributes)
    if (error !== undefined) {
      Sentry.captureException(error, attributes ? { tags: attributes } : undefined)
    }
  },
}
