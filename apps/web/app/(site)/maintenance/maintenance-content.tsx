'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { RefreshCcw } from 'lucide-react'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// /maintenance content. A self-contained "court in recess" scene — the chamber
// is closed and the herald is away. The page makes NO network calls; every
// pixel is local, so it renders when nothing else can.
//
// The centrepiece is an hourglass: a stylised SVG silhouette (two trapezoid
// bulbs joined at the pinch, with twin frame caps) over which three gold
// "sand grains" continuously drift from the upper bulb through the pinch
// into the lower bulb, each on its own rhythm.
//
// Motion (one useGSAP, gated on gsap.matchMedia()):
//   • Entrance — vignette fades, hourglass scales in (back ease), header
//     rises (kicker → title → rule → lede), the two status cards rise
//     (stagger), and the actions rise. The "Try again" button uses scale
//     (not opacity/transform) on hover via a CSS rule that does not touch
//     the gsap-animated opacity/transform of the entrance — so the two never
//     fight (the documented two-element pattern, applied here by routing
//     hover only to colour + lift).
//   • Ambient (kicks in on entrance complete) — three gold grains drift
//     from the upper bulb through the pinch to the lower bulb on staggered
//     loops; the hourglass itself rocks very gently (±1.5°) on a slow loop.
// references/animations.md.

const CTA_CLASS =
  'h-12 rounded-sm border border-gold/55 px-8 font-display text-sm tracking-[0.16em] uppercase shadow-md transition-[border-color,box-shadow,color,background-color] duration-200 hover:border-gold hover:bg-gold/10 hover:shadow-lg'

// Three grains — start positions inside the upper bulb (y < 70), end positions
// inside the lower bulb (y > 70). x is in the SVG viewBox 0–100.
const GRAINS = [
  { startX: 50, startY: 38, endX: 50, endY: 105, delay: 0 },
  { startX: 46, startY: 48, endX: 52, endY: 112, delay: 0.7 },
  { startX: 54, startY: 44, endX: 48, endY: 100, delay: 1.4 },
]

export function MaintenanceContent() {
  const ref = useRef<HTMLDivElement>(null)
  // The "Try again" button shows a small spinner while the page reloads. The
  // state doesn't need to survive the reload — it only smooths the click.
  const [retrying, setRetrying] = useState(false)

  const onRetry = useCallback(() => {
    if (typeof window === 'undefined') return
    setRetrying(true)
    window.location.reload()
  }, [])

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const q = gsap.utils.selector(el)
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        // Continuous ambient — kicked off when the entrance completes.
        function startAmbient() {
          // Three grains drifting through the hourglass forever. `getAttribute`
          // lives on the base Element interface, so no SVG-specific cast is
          // required even though these targets are <circle> nodes.
          q('[data-grain]').forEach((grain) => {
            const startX = Number(grain.getAttribute('data-start-x'))
            const startY = Number(grain.getAttribute('data-start-y'))
            const endX = Number(grain.getAttribute('data-end-x'))
            const endY = Number(grain.getAttribute('data-end-y'))
            const baseDelay = Number(grain.getAttribute('data-delay') ?? 0)
            // Reset → fall → reset, looped.
            gsap.set(grain, { attr: { cx: startX, cy: startY }, opacity: 0 })
            const tl = gsap.timeline({ repeat: -1, delay: baseDelay })
            tl.to(grain, { opacity: 1, duration: 0.4, ease: 'sine.out' })
              // Pull toward the pinch first (50, 70), then through to the lower bulb.
              .to(
                grain,
                {
                  attr: { cx: 50, cy: 70 },
                  duration: 1.4,
                  ease: 'sine.in',
                },
                '<',
              )
              .to(grain, {
                attr: { cx: endX, cy: endY },
                duration: 1.2,
                ease: 'sine.out',
              })
              .to(grain, { opacity: 0, duration: 0.5, ease: 'sine.in' }, '-=0.3')
              // Sit invisibly at the bottom for a beat before resetting.
              .to({}, { duration: 0.6 })
          })
          // The hourglass rocks very gently on a slow loop.
          const hg = q('[data-hourglass]')[0]
          if (hg) {
            gsap.fromTo(
              hg,
              { rotate: -1.2 },
              {
                rotate: 1.2,
                duration: 4,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
                transformOrigin: '50% 50%',
              },
            )
          }
        }

        const tl = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete: startAmbient,
        })
        tl.from(q('[data-vignette]'), {
          opacity: 0,
          duration: 0.6,
          ease: 'power2.out',
        })
          .from(
            q('[data-hourglass]'),
            {
              scale: 0,
              opacity: 0,
              duration: 0.6,
              ease: 'back.out(2)',
              transformOrigin: '50% 50%',
            },
            '-=0.3',
          )
          .from(
            q('[data-h="kicker"]'),
            { y: -16, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.3',
          )
          .from(
            q('[data-h="title"]'),
            { y: 24, opacity: 0, duration: 0.55 },
            '-=0.25',
          )
          .from(
            q('[data-h="rule"]'),
            { scaleX: 0, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.25',
          )
          .from(
            q('[data-h="lede"]'),
            { y: 16, opacity: 0, duration: 0.5 },
            '-=0.3',
          )
          .from(
            q('[data-card]'),
            {
              y: 22,
              opacity: 0,
              duration: 0.5,
              stagger: 0.1,
            },
            '-=0.15',
          )
          .from(
            q('[data-h="actions"]'),
            { y: 14, opacity: 0, duration: 0.45 },
            '-=0.15',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <div ref={ref} className="flex flex-col items-center gap-8 text-center">
      {/* Faint vignette behind the hourglass — gives the centrepiece some lift. */}
      <div className="relative flex h-44 w-32 items-center justify-center sm:h-52 sm:w-36">
        <span
          data-vignette
          aria-hidden
          className="pointer-events-none absolute inset-0 -m-10 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--gold)_18%,transparent)_0%,transparent_70%)] opacity-60"
        />

        {/* The hourglass. SVG, viewBox 100 × 140. */}
        <svg
          data-hourglass
          viewBox="0 0 100 140"
          aria-hidden
          className="relative size-full"
        >
          {/* Top frame cap. */}
          <rect
            x="10"
            y="6"
            width="80"
            height="12"
            rx="1"
            fill="oklch(0.18 0.02 60)"
            stroke="oklch(0.74 0.13 84)"
            strokeOpacity="0.6"
            strokeWidth="1"
          />
          {/* Upper bulb — wide at top, narrow at the pinch. */}
          <polygon
            points="14,18 86,18 52,70 48,70"
            fill="oklch(0.18 0.02 60)"
            stroke="oklch(0.74 0.13 84)"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          {/* Lower bulb — narrow at the pinch, wide at the base. */}
          <polygon
            points="48,70 52,70 86,122 14,122"
            fill="oklch(0.18 0.02 60)"
            stroke="oklch(0.74 0.13 84)"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          {/* Bottom frame cap. */}
          <rect
            x="10"
            y="122"
            width="80"
            height="12"
            rx="1"
            fill="oklch(0.18 0.02 60)"
            stroke="oklch(0.74 0.13 84)"
            strokeOpacity="0.6"
            strokeWidth="1"
          />
          {/* Settled sand pile in the lower bulb — a curved trapezoid. */}
          <polygon
            points="22,122 78,122 64,112 36,112"
            fill="oklch(0.74 0.13 84)"
            fillOpacity="0.45"
          />
          {/* Settled sand mound in the upper bulb — short cap at the top. */}
          <polygon
            points="16,22 84,22 74,32 26,32"
            fill="oklch(0.74 0.13 84)"
            fillOpacity="0.35"
          />
          {/* Three drifting grains. */}
          {GRAINS.map((g, i) => (
            <circle
              key={i}
              data-grain
              data-start-x={g.startX}
              data-start-y={g.startY}
              data-end-x={g.endX}
              data-end-y={g.endY}
              data-delay={g.delay}
              cx={g.startX}
              cy={g.startY}
              r="1.6"
              fill="oklch(0.82 0.14 84)"
              opacity="0"
            />
          ))}
        </svg>
      </div>

      {/* Header. */}
      <header className="flex flex-col items-center gap-2">
        <p
          data-h="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          Court in recess
        </p>
        <h1
          data-h="title"
          className="font-display text-3xl tracking-wide text-balance sm:text-4xl"
        >
          The chamber is <span className="text-primary">closed</span>
        </h1>
        <div data-h="rule">
          <OrnamentDivider className="w-48 max-w-[70vw] text-gold/60" />
        </div>
        <p
          data-h="lede"
          className="max-w-md text-pretty text-muted-foreground"
        >
          The herald has stepped away. The game server is unreachable just now
          — ranked play will resume as soon as the doors reopen.
        </p>
      </header>

      {/* Two status cards — what is paused vs. what still works. */}
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <StatusCard
          tone="muted"
          title="Currently paused"
          items={[
            'Joining matches and ranked play',
            'The leaderboard',
            'Profile and match-history pages',
            'Signing in or out',
          ]}
        />
        <StatusCard
          tone="gold"
          title="Still open"
          items={[
            'Rules and the chronicle',
            'About, Support, and the Hall of Patrons',
            'Privacy and Terms',
            'This page',
          ]}
        />
      </div>

      {/* Actions. */}
      <div data-h="actions" className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          size="lg"
          onClick={onRetry}
          disabled={retrying}
          className={CTA_CLASS}
        >
          <RefreshCcw
            className={cn(
              'mr-2 size-4',
              retrying && 'animate-spin motion-reduce:animate-none',
            )}
            aria-hidden
          />
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
        <Button asChild variant="ghost" size="lg" className="h-12 px-6">
          <Link href="/">Return to the hall</Link>
        </Button>
      </div>
    </div>
  )
}

// One status card — a parchment leaf with a small heading and a bulleted list.
// Two tones: `gold` for the "still open" panel, `muted` for the "paused" panel.
function StatusCard({
  tone,
  title,
  items,
}: {
  tone: 'gold' | 'muted'
  title: string
  items: string[]
}) {
  return (
    <div
      data-card
      className={cn(
        'flex flex-col gap-3 rounded-md border bg-card/85 p-5 text-left shadow-sm',
        tone === 'gold' ? 'border-gold/45' : 'border-border',
      )}
    >
      <h2
        className={cn(
          'font-display text-sm tracking-[0.18em] uppercase',
          tone === 'gold' ? 'text-gold' : 'text-muted-foreground',
        )}
      >
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={cn(
                'mt-2 size-1.5 shrink-0 rotate-45',
                tone === 'gold' ? 'bg-gold/70' : 'bg-muted-foreground/60',
              )}
            />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
