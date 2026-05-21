'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import './globals.css'

// App Router global error boundary — captures render errors anywhere in the
// tree (including failures of the root layout itself) to Sentry. SKILL.md § 5.
// It replaces the whole document on a crash, so it renders its own <html> and
// imports globals.css directly (the layout's stylesheet link may be gone).
// next/font variables aren't present here, so the theme fonts fall back to the
// serif stack declared in globals.css — graceful, no crash-in-the-crash.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="antialiased">
        <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
          {/* Typography-only wordmark. next/font variables aren't loaded here
              so we can't rely on Cinzel; the inline letter-spacing + caps make
              it recognizable even on the serif fallback. */}
          <p className="text-xs font-bold tracking-[0.4em] text-primary uppercase">
            Coup Online
          </p>
          <h1 className="font-display text-2xl tracking-wide text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            We hit an unexpected error loading the page. It&rsquo;s been
            reported. Try again, or head back to the court.
          </p>
          {/* Production digest — what the user should quote when reporting.
              Only rendered when Next.js provides one (production builds). */}
          {error.digest && (
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70">
              Reference: {error.digest}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            {/* Crash boundary: a full-page navigation gives a clean slate —
                a next/link soft-nav would re-enter the broken render tree. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
            >
              Back to the court
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
