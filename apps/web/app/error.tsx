'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import * as Sentry from '@sentry/nextjs'
import { Logo } from '@/components/logo'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { Button } from '@/components/ui/button'

// App-wide error boundary (Next.js App Router convention — must be a Client
// Component, lives at app/error.tsx, renders INSIDE the root layout so the
// footer + base styles are present). Catches any error thrown below the root
// segment that isn't caught by a more specific error.tsx further down the
// tree. For root-layout errors (extremely rare — would mean the layout
// itself crashed), see app/global-error.tsx.
//
// Sentry capture: SDK auto-instruments React error boundaries, but doing it
// explicitly here belts-and-braces — and means the error is reported with
// the actual digest the user sees on the screen, which makes the Sentry
// issue and user-facing copy correlatable when triaging.
//
// Theme: less elaborate than the 404 page on purpose. A user hitting this is
// frustrated, not curious — give them a way out, not a show. One soft fade,
// two buttons (Try again / Back to home).

// Gilded plaque CTA — matches the not-found / closing-section treatment.
const CTA_CLASS =
  'h-12 rounded-sm border border-gold/55 px-8 font-display text-sm tracking-[0.16em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg'

export default function Error({
  error,
  reset,
}: {
  // The Next.js convention — `error.digest` is present in production and is
  // the same id surfaced to Sentry, useful for "this is what to quote when
  // reporting" UX.
  error: Error & { digest?: string }
  reset: () => void
}) {
  const ref = useRef<HTMLElement>(null)

  // Report to Sentry once per mount. Dependency includes `error` so a fresh
  // throw (e.g., the user clicks Try again and it fails differently) is
  // captured as a distinct event.
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const q = gsap.utils.selector(el)
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from(q('[data-err="logo"]'), { y: -10, opacity: 0, duration: 0.35 })
          .from(
            q('[data-err="card"]'),
            { y: 18, opacity: 0, duration: 0.45 },
            '-=0.2',
          )
          .from(
            q('[data-err="title"]'),
            { y: 14, opacity: 0, duration: 0.4 },
            '-=0.25',
          )
          .from(
            q('[data-err="text"]'),
            { y: 12, opacity: 0, duration: 0.4 },
            '-=0.25',
          )
          .from(
            q('[data-err="cta"]'),
            { y: 16, opacity: 0, duration: 0.4 },
            '-=0.2',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <main
      ref={ref}
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16 text-center"
    >
      <div className="relative z-10 flex flex-col items-center gap-6">
        <Link
          data-err="logo"
          href="/"
          aria-label="Coup Online — home"
          className="transition-opacity hover:opacity-80"
        >
          <Logo size="sm" />
        </Link>

        <h1 className="sr-only">Something went wrong</h1>

        {/* A muted, tilted card with an inkblot — the page equivalent of a
            spoiled play. Decorative; aria-hidden. */}
        <div
          data-err="card"
          aria-hidden
          style={{ rotate: '-3deg', backgroundColor: 'oklch(0.31 0.008 70)' }}
          className="relative flex aspect-5/7 w-40 items-center justify-center overflow-hidden rounded-xl border-2 border-gold/40 shadow-xl sm:w-48"
        >
          <div className="pointer-events-none absolute inset-2.5 rounded-md border border-gold/30" />
          {/* Ink blot — a smudgy radial dot. */}
          <span
            aria-hidden
            className="absolute h-20 w-20 rounded-full sm:h-24 sm:w-24"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, oklch(0.22 0.05 25 / 0.85), oklch(0.16 0.04 25 / 0.6) 55%, transparent 80%)',
              filter: 'blur(0.5px)',
            }}
          />
          <span
            aria-hidden
            className="absolute -top-2 right-2 h-3 w-3 rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.22 0.05 25 / 0.8), transparent 70%)',
            }}
          />
          <span
            aria-hidden
            className="absolute bottom-3 left-4 h-2 w-2 rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.22 0.05 25 / 0.7), transparent 70%)',
            }}
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <p
            data-err="title"
            className="font-display text-2xl tracking-wide sm:text-3xl"
          >
            A move didn&rsquo;t land
          </p>
          <p
            data-err="text"
            className="max-w-md text-pretty text-muted-foreground"
          >
            Something went wrong on our end. Try again, or head back to the
            court.
          </p>
          {/* Surface the digest in production so the user can quote it when
              reporting. Hidden in dev where stacks are visible elsewhere. */}
          {error.digest && (
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70">
              Reference: {error.digest}
            </p>
          )}
        </div>

        <div
          data-err="cta"
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            type="button"
            size="lg"
            onClick={() => reset()}
            className={CTA_CLASS}
          >
            Try again
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-6">
            <Link href="/">Back to the court</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
