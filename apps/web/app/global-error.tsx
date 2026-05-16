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
          <h1 className="font-display text-2xl tracking-wide text-primary">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred and has been reported. Try again, or
            return to the lobby.
          </p>
          <div className="flex gap-2">
            <button
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
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium"
            >
              Back to lobby
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
