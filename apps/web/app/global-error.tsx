'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

// App Router global error boundary — captures render errors anywhere in the
// tree (including failures of the root layout itself) to Sentry. SKILL.md § 5.
// It replaces the whole document on a crash, so it renders its own <html>.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        {/* NextError's type requires a statusCode; the App Router doesn't
            expose one for render errors, so 0 renders a generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
