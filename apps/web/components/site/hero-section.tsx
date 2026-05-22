'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import LightRays from '@/components/light-rays'
import { Logo } from '@/components/logo'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Button } from '@/components/ui/button'

// Faint paper-grain texture — an inline SVG fractal-noise tile, desaturated,
// laid over the parchment at very low opacity. Self-contained (no image
// asset); a static background, never an animated filter (SKILL.md § 5).
const PAPER_NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

// Candlelight motes — fixed positions (deterministic: no Math.random, no
// hydration drift). Each drifts on a slow, out-of-phase loop. Decorative.
const MOTES = [
  { left: '8%', top: '20%', size: 4 },
  { left: '16%', top: '62%', size: 3 },
  { left: '24%', top: '34%', size: 5 },
  { left: '34%', top: '78%', size: 3 },
  { left: '12%', top: '46%', size: 2 },
  { left: '44%', top: '14%', size: 3 },
  { left: '58%', top: '82%', size: 4 },
  { left: '66%', top: '24%', size: 3 },
  { left: '74%', top: '58%', size: 5 },
  { left: '84%', top: '38%', size: 3 },
  { left: '90%', top: '70%', size: 4 },
  { left: '52%', top: '50%', size: 2 },
  { left: '78%', top: '12%', size: 2 },
  { left: '30%', top: '90%', size: 3 },
]

// Landing hero — an atmospheric, type-led "illuminated manuscript" treatment.
// The single call-to-action leads to /play, which owns the create/join flow
// and its own session gate (SKILL.md § 1 — no guest play).
//
// Layers (back → front): the WebGL light-rays backdrop, an edge vignette, a
// faint paper-grain texture, a field of drifting candlelight motes, an inset
// gold manuscript frame with corner lozenges, and the content column — kicker,
// logo, ornamental rule, a monumental Cinzel headline, lede, a second rule,
// and the call-to-action button.
//
// Motion (one useGSAP, gated on gsap.matchMedia()):
//  • Entrance — atmosphere fades in, the frame settles and its corner lozenges
//    pop, then the copy reveals: the headline rises word by word.
//  • Ambient — the motes drift continuously on slow, out-of-phase loops.
//  • Parallax — on fine pointers, the cursor drifts the frame and mote layers
//    for depth. references/animations.md.
export function HeroSection() {
  const router = useRouter()
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const q = gsap.utils.selector(el)
      const mm = gsap.matchMedia()

      // Entrance + ambient — runs unless the visitor asked for reduced motion.
      mm.add(NO_REDUCED_MOTION, () => {
        // Ambient mote drift — continuous, out of phase per mote.
        q('[data-mote]').forEach((mote, i) => {
          gsap.to(mote, {
            y: -22 - (i % 5) * 8,
            x: (i % 2 ? 1 : -1) * (8 + (i % 3) * 6),
            opacity: 0.16,
            duration: 7 + (i % 6),
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          })
        })

        gsap
          .timeline({ delay: 0.15, defaults: { ease: 'power3.out' } })
          .from([q('[data-hero="vignette"]'), q('[data-hero="texture"]')], {
            opacity: 0,
            duration: 0.7,
          })
          .from(
            q('[data-hero="frame"]'),
            { opacity: 0, scale: 1.04, duration: 0.8 },
            '-=0.35',
          )
          .from(
            q('[data-frame-corner]'),
            {
              scale: 0,
              opacity: 0,
              duration: 0.4,
              stagger: 0.08,
              ease: 'back.out(2)',
            },
            '-=0.3',
          )
          .from(
            q('[data-hero="motes"]'),
            { opacity: 0, duration: 0.9 },
            '-=0.5',
          )
          .from(
            q('[data-hero="kicker"]'),
            { y: -26, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.5',
          )
          .from(
            q('[data-hero="logo"]'),
            { scale: 0.5, opacity: 0, duration: 0.7, ease: 'back.out(1.8)' },
            '-=0.15',
          )
          .from(
            q('[data-ornament]'),
            {
              scaleX: 0,
              opacity: 0,
              duration: 0.5,
              stagger: 0.12,
              ease: 'power2.out',
            },
            '-=0.2',
          )
          .from(
            q('[data-hero-word]'),
            {
              yPercent: 120,
              opacity: 0,
              duration: 0.6,
              stagger: 0.08,
              ease: 'back.out(1.4)',
            },
            '-=0.35',
          )
          .from(
            q('[data-hero="lede"]'),
            { y: 24, opacity: 0, duration: 0.55 },
            '-=0.25',
          )
          .from(
            q('[data-hero="cta"]'),
            { y: 36, opacity: 0, duration: 0.6 },
            '-=0.3',
          )
      })

      // Pointer parallax — fine pointers only, never under reduced motion.
      mm.add(
        '(prefers-reduced-motion: no-preference) and (pointer: fine)',
        () => {
          const motes = q('[data-layer="motes"]')[0]
          const frame = q('[data-layer="frame"]')[0]
          if (!motes || !frame) return

          const xMotes = gsap.quickTo(motes, 'x', { duration: 0.6, ease: 'power2.out' })
          const yMotes = gsap.quickTo(motes, 'y', { duration: 0.6, ease: 'power2.out' })
          const xFrame = gsap.quickTo(frame, 'x', { duration: 0.9, ease: 'power2.out' })
          const yFrame = gsap.quickTo(frame, 'y', { duration: 0.9, ease: 'power2.out' })

          const onMove = (e: PointerEvent) => {
            const r = el.getBoundingClientRect()
            const nx = (e.clientX - r.left) / r.width - 0.5
            const ny = (e.clientY - r.top) / r.height - 0.5
            xMotes(nx * 40)
            yMotes(ny * 26)
            xFrame(nx * 12)
            yFrame(ny * 8)
          }
          el.addEventListener('pointermove', onMove)
          return () => el.removeEventListener('pointermove', onMove)
        },
      )

      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <section
      ref={ref}
      className="relative flex min-h-svh snap-start flex-col justify-center overflow-hidden"
    >
      {/* Decorative antique-gold light-rays backdrop (WebGL via ogl) — the
          #d1a33b ≈ the `gold` token. Behind everything, pointer-events-none;
          motion-reduce:hidden drops it (and stops the render loop). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 motion-reduce:hidden"
      >
        <LightRays
          raysOrigin="top-center"
          raysColor="#d1a33b"
          raysSpeed={1}
          lightSpread={0.5}
          rayLength={3}
          followMouse
          mouseInfluence={0.1}
          noiseAmount={0}
          distortion={0}
          pulsating={false}
          fadeDistance={1}
          saturation={1}
        />
      </div>

      {/* Edge vignette — warms and frames the scene. */}
      <div
        data-hero="vignette"
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 66% at 50% 34%, transparent 54%, oklch(0.22 0.03 60 / 0.34))',
        }}
      />

      {/* Faint paper grain. */}
      <div
        data-hero="texture"
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: PAPER_NOISE, backgroundSize: '160px 160px' }}
      />

      {/* Drifting candlelight motes. Parallax rides this wrapper; each mote
          takes the ambient drift. */}
      <div
        data-layer="motes"
        data-hero="motes"
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        {MOTES.map((m) => (
          <span
            key={`${m.left}-${m.top}`}
            data-mote
            className="absolute rounded-full bg-gold/40"
            style={{ left: m.left, top: m.top, width: m.size, height: m.size }}
          />
        ))}
      </div>

      {/* Inset manuscript frame — a gold rule with corner lozenges. The top
          clears the fixed navbar; the bottom is pulled in to match. The side
          rails stay near the edge so they never crowd inside the headline on
          narrow viewports. */}
      <div
        data-layer="frame"
        data-hero="frame"
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-15 bottom-8 rounded-sm border border-gold/35 sm:inset-x-6 sm:top-14 sm:bottom-10"
      >
        <span
          data-frame-corner
          className="absolute -top-1 -left-1 size-2 rotate-45 bg-gold"
        />
        <span
          data-frame-corner
          className="absolute -top-1 -right-1 size-2 rotate-45 bg-gold"
        />
        <span
          data-frame-corner
          className="absolute -bottom-1 -left-1 size-2 rotate-45 bg-gold"
        />
        <span
          data-frame-corner
          className="absolute -right-1 -bottom-1 size-2 rotate-45 bg-gold"
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center">
        <p
          data-hero="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          Real-time · 3–6 players
        </p>
        <div data-hero="logo">
          <Logo size="lg" />
        </div>
        <OrnamentDivider className="w-56 max-w-[70%] text-gold/70" />
        <h1 className="font-display text-4xl leading-tight tracking-wide text-balance sm:text-6xl lg:text-7xl">
          <span data-hero-word className="inline-block">
            Everyone
          </span>{' '}
          <span data-hero-word className="inline-block">
            at
          </span>{' '}
          <span data-hero-word className="inline-block">
            the
          </span>{' '}
          <span data-hero-word className="inline-block">
            table
          </span>{' '}
          <span data-hero-word className="inline-block">
            is
          </span>{' '}
          <span data-hero-word className="inline-block text-primary">
            bluffing.
          </span>
        </h1>
        <p
          data-hero="lede"
          className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg"
        >
          Coup is a duel of nerve and deception. Claim powers you may not hold,
          unmask the liars across the table, and be the last soul with
          influence at court.
        </p>
        <OrnamentDivider className="w-56 max-w-[70%] text-gold/70" />
        <div
          data-hero="cta"
          className="mt-2 flex w-full flex-col items-center gap-3"
        >
          <Button
            size="lg"
            onClick={() => router.push('/play')}
            className="h-12 rounded-sm border border-gold/55 px-10 font-display text-sm tracking-[0.18em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg"
          >
            Enter the court
          </Button>
          {/* Explicit app description + legal links — present in the
              static HTML (not just the footer) so OAuth-provider brand
              reviewers and indexing crawlers can find them without
              scrolling. The app-name string matches the OAuth consent
              screen and the page metadata exactly: "Coup Online". */}
          <p className="max-w-md text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">Coup Online</strong>{' '}
            is a free, browser-based real-time adaptation of the Coup card
            game for 3 to 6 players. No download, no ads, no tracking.
          </p>
          <p className="text-xs text-muted-foreground">
            By signing in, you agree to our{' '}
            <Link
              href="/terms"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
