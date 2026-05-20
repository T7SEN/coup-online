'use client'

/* eslint-disable @next/next/no-img-element -- the character card SVGs are
   local, trusted assets in public/cards; next/image SVG handling needs the
   global dangerouslyAllowSVG flag, which we don't want to enable. */

import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { SectionHeading } from '@/components/site/section-heading'
import { cn } from '@/lib/utils'

// The five characters and their powers. SKILL.md § 4.1, § 4.4, § 4.5.
const CHARACTERS: {
  name: string
  art: string
  action: string | null
  blocks: string | null
}[] = [
  {
    name: 'Duke',
    art: '/cards/duke.svg',
    action: 'Tax — take 3 coins.',
    blocks: 'Foreign Aid',
  },
  {
    name: 'Assassin',
    art: '/cards/assassin.svg',
    action: 'Assassinate — pay 3 coins; a rival loses an influence.',
    blocks: null,
  },
  {
    name: 'Captain',
    art: '/cards/captain.svg',
    action: 'Steal — take 2 coins from a rival.',
    blocks: 'Stealing',
  },
  {
    name: 'Ambassador',
    art: '/cards/ambassador.svg',
    action: 'Exchange — draw 2 cards and swap your hand.',
    blocks: 'Stealing',
  },
  {
    name: 'Contessa',
    art: '/cards/contessa.svg',
    action: null,
    blocks: 'Assassination',
  },
]

// Max tilt (degrees) a card swings toward the cursor. Flip either sign in the
// pointer handler to reverse the axis.
const TILT = 14

// "The court" — the five base-game characters as a spotlight rack. Pointing at
// (or tapping) a card stages it theatrically — a warm candlelight glow blooms
// behind it and it lifts forward while the rest darken and recede — and on
// fine pointers it tilts in 3D toward the cursor.
//
// Entrance (ScrollTrigger): the heading rises, then the cards are *dealt* —
// bursting from the centre with a random spin, overshooting into place
// (`back.out`). Gated on `gsap.matchMedia()`. `gsap.utils.random` drives the
// cosmetic spin only — never game logic (SKILL.md § 0 step 8).
//
// The deal targets the <li>, the spotlight transforms an inner panel, and the
// 3D tilt a `tilt` element — three owners, so the transforms never collide.
// references/animations.md.
export function TheCourtSection() {
  const ref = useRef<HTMLElement>(null)
  const [focused, setFocused] = useState<number | null>(null)
  // Per-card quickTo setters for the 3D tilt; populated on fine pointers only.
  const tiltRef = useRef<
    { rx: (v: number) => void; ry: (v: number) => void }[] | null
  >(null)

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const q = gsap.utils.selector(el)
      const mm = gsap.matchMedia()

      // Deal entrance — runs unless the visitor asked for reduced motion.
      mm.add(NO_REDUCED_MOTION, () => {
        gsap
          .timeline({
            defaults: { ease: 'power3.out' },
            scrollTrigger: { trigger: el, start: 'top 70%' },
          })
          .from(q('[data-court="heading"]'), {
            y: 30,
            opacity: 0,
            duration: 0.5,
          })
          .from(
            q('[data-court-card]'),
            {
              y: 110,
              opacity: 0,
              scale: 0.78,
              rotation: () => gsap.utils.random(-22, 22),
              duration: 0.7,
              ease: 'back.out(1.4)',
              stagger: { each: 0.1, from: 'center' },
            },
            '-=0.15',
          )
      })

      // 3D cursor tilt — fine pointers only, never under reduced motion.
      mm.add(
        '(prefers-reduced-motion: no-preference) and (pointer: fine)',
        () => {
          tiltRef.current = q('[data-court-tilt]').map((tilt) => {
            gsap.set(tilt, { transformPerspective: 800 })
            return {
              rx: gsap.quickTo(tilt, 'rotationX', {
                duration: 0.4,
                ease: 'power2.out',
              }),
              ry: gsap.quickTo(tilt, 'rotationY', {
                duration: 0.4,
                ease: 'power2.out',
              }),
            }
          })
          return () => {
            tiltRef.current = null
          }
        },
      )

      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <section
      ref={ref}
      className="flex min-h-svh snap-start flex-col justify-center border-t border-gold/30"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:py-20">
        <div data-court="heading">
          <SectionHeading kicker="Five faces of power" title="The court" />
        </div>
        <ul
          onPointerLeave={() => setFocused(null)}
          className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5"
        >
          {CHARACTERS.map((c, i) => (
            <li
              key={c.name}
              data-court-card
              onPointerEnter={() => setFocused(i)}
              onPointerMove={(e) => {
                const s = tiltRef.current?.[i]
                if (!s) return
                const r = e.currentTarget.getBoundingClientRect()
                const nx = (e.clientX - r.left) / r.width - 0.5
                const ny = (e.clientY - r.top) / r.height - 0.5
                s.ry(nx * TILT)
                s.rx(-ny * TILT)
              }}
              onPointerLeave={() => {
                const s = tiltRef.current?.[i]
                s?.rx(0)
                s?.ry(0)
              }}
            >
              <div
                className={cn(
                  'flex flex-col gap-3 transition duration-300 ease-out motion-reduce:transition-none',
                  focused === i && 'relative z-10 -translate-y-2 scale-105',
                  focused !== null && focused !== i && 'scale-90 opacity-30',
                )}
              >
                <div data-court-tilt>
                  <div className="relative">
                    {/* Candlelight glow — blooms behind the focused card. A
                        centred square box so the circular gradient fades out
                        fully on every side (a portrait box clips it L/R). */}
                    <div
                      aria-hidden
                      className={cn(
                        'pointer-events-none absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 transition duration-300 ease-out motion-reduce:transition-none',
                        focused === i
                          ? 'scale-100 opacity-100'
                          : 'scale-75 opacity-0',
                      )}
                      style={{
                        background:
                          'radial-gradient(circle, oklch(0.74 0.13 84 / 0.55), transparent 62%)',
                      }}
                    />
                    <img
                      src={c.art}
                      alt={`${c.name} card`}
                      loading="lazy"
                      className={cn(
                        'relative z-10 aspect-2/3 w-full rounded-lg border bg-card object-cover transition duration-300',
                        focused === i
                          ? 'border-gold/50 shadow-xl'
                          : 'border-gold/20 shadow-sm',
                      )}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <h3 className="font-display text-base tracking-wide">
                    {c.name}
                  </h3>
                  {c.action && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {c.action}
                    </p>
                  )}
                  {c.blocks && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <span className="text-foreground">Blocks</span>{' '}
                      {c.blocks}.
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
