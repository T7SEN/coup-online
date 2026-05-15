import * as Sentry from '@sentry/cloudflare'

// Worker logger — SKILL.md § 5. The single diagnostics chokepoint: call sites
// never use raw `console.*`. `info` / `warn` / `error` route to the Sentry
// Logs product; `error` additionally opens a Sentry Issue when given an
// exception. When SENTRY_DSN_WORKER is unset the Sentry SDK is disabled and
// every call no-ops.
//
// `debug` goes to `console.debug` only — server-side console is captured by
// Cloudflare and never user-visible, and the Worker has no NODE_ENV to gate
// on. Debug is never shipped to Sentry (keeps the Logs quota for real signal).
//
// This module is the one sanctioned place for `console.*` — it IS the logger.
//
// `attributes` are restricted to primitives so the same object is valid both
// as Sentry log attributes (queryable) and as Issue tags (filterable) — that
// is how `matchId` rides along on every event (SKILL.md § 5).

export type LogAttributes = Record<string, string | number | boolean>

export const logger = {
  debug(message: string, attributes?: LogAttributes): void {
    console.debug(message, attributes ?? '')
  },
  info(message: string, attributes?: LogAttributes): void {
    Sentry.logger.info(message, attributes)
  },
  warn(message: string, attributes?: LogAttributes): void {
    Sentry.logger.warn(message, attributes)
  },
  error(message: string, error?: unknown, attributes?: LogAttributes): void {
    Sentry.logger.error(message, attributes)
    if (error !== undefined) {
      Sentry.captureException(error, attributes ? { tags: attributes } : undefined)
    }
  },
}
