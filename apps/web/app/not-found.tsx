'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Logo } from '@/components/logo'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { Button } from '@/components/ui/button'

// Custom 404. Lives at the app root, so it covers both unmatched URLs and
// every `notFound()` call (the profile and match pages throw it). It renders
// inside the root layout — no navbar — so it is a self-contained full-screen
// scene with its own logo and exits.
//
// The centrepiece is a Coup-style playing card whose face reads "404". Motion
// (one useGSAP, gated on gsap.matchMedia()): the vignette fades, the card
// pops, its corner lozenges pop, then the copy and buttons rise.
// references/animations.md.

// Gilded plaque CTA — matches the hero / closing button treatment.
const CTA_CLASS =
  'h-12 rounded-sm border border-gold/55 px-8 font-display text-sm tracking-[0.16em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg'

export default function NotFound() {
  const ref = useRef<HTMLElement>(null)

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
          .from(q('[data-nf="vignette"]'), { opacity: 0, duration: 0.6 })
          .from(
            q('[data-nf="card"]'),
            { scale: 0.4, opacity: 0, duration: 0.65, ease: 'back.out(1.6)' },
            '-=0.3',
          )
          .from(
            q('[data-nf-corner]'),
            {
              scale: 0,
              opacity: 0,
              duration: 0.35,
              stagger: 0.07,
              ease: 'back.out(2)',
            },
            '-=0.2',
          )
          .from(
            q('[data-nf="title"]'),
            { y: 22, opacity: 0, duration: 0.5 },
            '-=0.15',
          )
          .from(
            q('[data-nf="text"]'),
            { y: 18, opacity: 0, duration: 0.45 },
            '-=0.25',
          )
          .from(
            q('[data-nf="cta"]'),
            { y: 20, opacity: 0, duration: 0.45 },
            '-=0.25',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <main
      ref={ref}
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-20 text-center"
    >
      {/* Edge vignette — warms and frames the scene. */}
      <div
        data-nf="vignette"
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 66% at 50% 40%, transparent 54%, oklch(0.22 0.03 60 / 0.34))',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <Link
          href="/"
          aria-label="Coup Online — home"
          className="transition-opacity hover:opacity-80"
        >
          <Logo size="sm" />
        </Link>

        <h1 className="sr-only">Error 404 — page not found</h1>

        {/* The centrepiece — a Coup-style card with "404" for its face. */}
        <div
          data-nf="card"
          aria-hidden
          style={{ rotate: '-5deg', backgroundColor: 'oklch(0.31 0.008 70)' }}
          className="relative flex aspect-[5/7] w-44 items-center justify-center overflow-hidden rounded-xl border-2 border-gold/55 shadow-xl sm:w-52"
        >
          {/* Soft light wash behind the numeral — a faint spotlight. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 34%, oklch(0.62 0.03 78 / 0.4), transparent 72%)',
            }}
          />
          {/* Inset manuscript frame with corner lozenges. */}
          <div className="pointer-events-none absolute inset-2.5 rounded-md border border-gold/35">
            <span
              data-nf-corner
              className="absolute -top-1 -left-1 size-1.5 rotate-45 bg-gold/80"
            />
            <span
              data-nf-corner
              className="absolute -top-1 -right-1 size-1.5 rotate-45 bg-gold/80"
            />
            <span
              data-nf-corner
              className="absolute -bottom-1 -left-1 size-1.5 rotate-45 bg-gold/80"
            />
            <span
              data-nf-corner
              className="absolute -right-1 -bottom-1 size-1.5 rotate-45 bg-gold/80"
            />
          </div>
          {/* Card face. */}
          <div className="relative flex flex-col items-center gap-2 px-4">
            <span className="font-display text-6xl leading-none text-gold sm:text-7xl">
              404
            </span>
            <span className="h-px w-10 bg-gold/50" />
            <span className="font-display text-xs tracking-[0.3em] text-gold uppercase">
              Not found
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p
            data-nf="title"
            className="font-display text-2xl tracking-wide sm:text-3xl"
          >
            You&rsquo;ve been bluffed
          </p>
          <p
            data-nf="text"
            className="max-w-md text-pretty text-muted-foreground"
          >
            That page isn&rsquo;t in the deck — it may have been moved, or
            never dealt at all.
          </p>
        </div>

        <div
          data-nf="cta"
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Button asChild size="lg" className={CTA_CLASS}>
            <Link href="/">Back to the court</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-6">
            <Link href="/play">Find a match</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
