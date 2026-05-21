'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// The about page's content + entrance motion (the page shell is ./page.tsx).
// Three beats — what the game is, who built it, and credit to the original —
// laid out to sit within one viewport.
//
// Motion (one useGSAP, gated on gsap.matchMedia()): the header reveals, the
// at-a-glance facts pop in, the story cards rise one by one, then the close
// lifts. references/animations.md.

// Gilded plaque CTA — matches the hero / closing button treatment.
const CTA_CLASS =
  'h-12 rounded-sm border border-gold/55 px-8 font-display text-sm tracking-[0.16em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg'

// Hover treatment for the fact tiles + story cards — the gold border
// brightens and a shadow lifts the element off the page. The transition is
// restricted to border-color + box-shadow ON PURPOSE: it must never cover
// opacity or transform, or it fights the GSAP entrance (which owns those)
// and the element gets stuck mid-animation, invisible.
const HOVER =
  'transition-[border-color,box-shadow] duration-200 hover:border-gold/60 hover:shadow-md'

// At-a-glance facts — short values so no tile wraps.
const FACTS = [
  { value: '3–6', label: 'Players' },
  { value: '~15 min', label: 'A match' },
  { value: 'Live', label: 'Real-time' },
  { value: 'Free', label: 'No ads, ever' },
]

// The three story beats.
const CARDS = [
  {
    title: 'The game',
    body: (
      <>
        A real-time game of bluff and court intrigue — three to six players
        race to be the last soul with influence.
      </>
    ),
  },
  {
    title: 'The project',
    body: (
      <>
        Built and paid for by a single student, for the love of it — free for
        all, with a{' '}
        <Link
          href="/support"
          className="text-primary underline-offset-2 transition-colors hover:underline"
        >
          patronage programme
        </Link>{' '}
        on the way.
      </>
    ),
  },
  {
    title: 'Credits',
    body: (
      <>
        An unofficial, fan-made adaptation of Coup, designed by Rikki Tahta —
        unaffiliated with its creator or publisher.
      </>
    ),
  },
]

export function AboutContent() {
  const ref = useRef<HTMLDivElement>(null)

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
          .from(q('[data-a="kicker"]'), {
            y: -18,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
          })
          .from(
            q('[data-a="title"]'),
            { y: 24, opacity: 0, duration: 0.55 },
            '-=0.25',
          )
          .from(
            q('[data-a="rule"]'),
            { scaleX: 0, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.25',
          )
          .from(
            q('[data-a="lede"]'),
            { y: 16, opacity: 0, duration: 0.5 },
            '-=0.3',
          )
          .from(
            q('[data-a="fact"]'),
            {
              y: 18,
              opacity: 0,
              scale: 0.9,
              duration: 0.4,
              stagger: 0.08,
              ease: 'back.out(1.6)',
            },
            '-=0.15',
          )
          .from(
            q('[data-a="card"]'),
            { y: 26, opacity: 0, duration: 0.5, stagger: 0.12 },
            '-=0.1',
          )
          .from(
            q('[data-a="closing"]'),
            { y: 20, opacity: 0, duration: 0.5 },
            '-=0.15',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <div ref={ref} className="flex flex-col gap-5">
      {/* Header. */}
      <header className="flex flex-col items-center gap-2 text-center">
        <p
          data-a="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          About
        </p>
        <h1
          data-a="title"
          className="font-display text-3xl tracking-wide text-balance sm:text-4xl"
        >
          About Coup Online
        </h1>
        <div data-a="rule">
          <OrnamentDivider className="w-48 max-w-[70vw] text-gold/60" />
        </div>
        <p
          data-a="lede"
          className="max-w-md text-pretty text-muted-foreground"
        >
          A real-time game of nerve, deception and court intrigue — built for
          the love of it.
        </p>
      </header>

      {/* At a glance. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FACTS.map((f) => (
          <div
            data-a="fact"
            key={f.label}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md border border-gold/30 bg-gold/6 px-3 py-4 text-center',
              HOVER,
            )}
          >
            <span className="font-display text-xl tracking-wide sm:text-2xl">
              {f.value}
            </span>
            <span className="text-xs tracking-wide text-muted-foreground">
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {/* The three story beats. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Card
            data-a="card"
            key={c.title}
            className={cn('border border-gold/30', HOVER)}
          >
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <h2 className="font-display text-lg tracking-wide">
                  {c.title}
                </h2>
                <div className="h-px w-8 bg-gold/40" />
              </div>
              <p className="text-sm text-muted-foreground">{c.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Close. */}
      <div
        data-a="closing"
        className="flex flex-col items-center gap-4 text-center"
      >
        <OrnamentDivider className="w-40 max-w-[55vw] text-gold/45" />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className={CTA_CLASS}>
            <Link href="/play">Play a match</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-6">
            <Link href="/rules">Read the rules</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
