import * as Sentry from '@sentry/nextjs'

// Browser Sentry init — Next.js loads this on every page. SKILL.md § 5.
// DSN unset → SDK disabled, no-ops.
//
// Enabled: error monitoring, tracing (Performance Monitoring), structured
// Logs, Session Replay, and the User Feedback widget. Metrics need no init
// flag — they're on by default in SDK ≥ 10.25 (only `enableMetrics: false`
// disables them); the `Sentry.metrics.*` calls get wired when there's a
// metric worth tracking.

// URLs we don't own. Chrome/Firefox/Safari extensions inject content scripts
// that wrap `window.fetch`, `XMLHttpRequest`, and other globals; when their
// wrapper logic fails, the rejection bubbles up as if our code threw it.
// `injectScriptAdjust.js` specifically is a known affiliate / page-modifier
// extension (issue 7496402981 — unhandled rejection on /auth/callback).
// Filtering by URL pattern here drops the event before it's sent.
const THIRD_PARTY_URL_PATTERNS = [
  /injectScriptAdjust\.js$/i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
  // Extension content-script bundles sometimes register as a generic
  // resource:// URI — common across Firefox forks.
  /^resource:\/\/\/?gre/i,
]

function isExtensionFrame(filename: string | undefined | null): boolean {
  if (!filename) return false
  return THIRD_PARTY_URL_PATTERNS.some((re) => re.test(filename))
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Release tag — typically the git SHA, set by CI/CD as
  //   SENTRY_RELEASE=$GITHUB_SHA  (or whatever your runner exposes)
  // and surfaced to the browser bundle via next.config.ts env. When unset
  // (local dev), Sentry omits the tag — that's the desired behaviour.
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  sendDefaultPii: false,
  // Sentry Logs product.
  enableLogs: true,
  // Coarse filter — Sentry checks the origin URL of the topmost frame
  // against this list. Catches the common case where the extension's
  // injected script is on top.
  denyUrls: THIRD_PARTY_URL_PATTERNS,
  // Drops the event before it leaves the browser if ANY frame in the
  // stack is from an extension URL — covers the case where the
  // extension re-throws into one of our chunks and the top frame is
  // ours but the cause is theirs. Returning `null` discards the event;
  // returning the event keeps it.
  beforeSend(event) {
    const exceptions = event.exception?.values ?? []
    for (const ex of exceptions) {
      const frames = ex.stacktrace?.frames ?? []
      if (frames.some((f) => isExtensionFrame(f.filename))) {
        return null
      }
    }
    return event
  },
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
