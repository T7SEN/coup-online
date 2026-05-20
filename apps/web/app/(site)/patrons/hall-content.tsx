'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Button } from '@/components/ui/button'

// Hall of Patrons — the Honour Roll.
//
// A vertical illuminated parchment scroll. Ten ruled lines, each one a slot
// for a Founding patron. Calligraphic numerals down the left margin, the
// patron name (or "vacant") in the centre, an ornamental flourish ready to
// unfurl on the right.
//
// Atmosphere is built in DOM:
//   • the scroll is a centred panel with twin "rod" caps (top + bottom), gold
//     edge-bands, and a faint ruling line on every entry;
//   • the scroll body is scrollable inside itself so the whole page fits in
//     the viewport — gold-tinted slim webkit scrollbar, with a soft fade-edge
//     mask at top + bottom hinting that more lines lie beyond;
//   • each numeral is its own glyph (calligraphic Cinzel), gilded.
//
// Motion (one useGSAP, gated on gsap.matchMedia()):
//   • Entrance — header rises (kicker → title → rule → lede), the scroll
//     unfurls from the top rod (scaleY origin top + opacity), the entries
//     stagger in line by line, then the close lifts.
//   • Ambient (kicks in on entrance complete) — the rod-cap finials twinkle
//     on a slow out-of-phase loop.
// Hover/focus an entry — the numeral brightens, the line's flourish unfurls
// (scaleX from 0), the rule beneath gilds. Pure CSS, on a wrapper that is
// NOT the gsap-`from`-animated element (`group/row` parent ↔ inner targets),
// so the two never fight (the documented two-element pattern).
// references/animations.md.

const CTA_CLASS =
  'h-12 rounded-sm border border-gold/55 px-8 font-display text-sm tracking-[0.16em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg'

// The ten Founding-patron slots, in order.
const NUMERALS = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
]
const FOUNDING_LIMIT = NUMERALS.length

// No patrons yet — names line up with NUMERALS by index.
const PATRONS: string[] = []

// One row of the honour roll. Calligraphic numeral · centred name · flourish.
// The whole row is a `group/row` so CSS hover can light up multiple children;
// gsap animates `[data-entry]` (a separate inner element), so the two never
// race on the same property.
function Entry({ numeral, name }: { numeral: string; name?: string }) {
  const filled = name != null && name.length > 0
  return (
    <li className="group/row relative">
      <div
        data-entry
        className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 px-3 py-3 sm:grid-cols-[3rem_1fr_3rem] sm:px-5"
      >
        {/* Calligraphic numeral. */}
        <span
          aria-hidden
          className="font-display text-lg tracking-wider text-gold/70 transition-colors duration-200 group-hover/row:text-gold sm:text-xl"
        >
          {numeral}
        </span>

        {/* Patron name, centred. */}
        <span className="text-center">
          {filled ? (
            <span className="font-display text-base tracking-wide text-foreground transition-colors duration-200 group-hover/row:text-gold sm:text-lg">
              {name}
            </span>
          ) : (
            <span className="text-sm tracking-[0.2em] text-muted-foreground/70 italic uppercase transition-colors duration-200 group-hover/row:text-muted-foreground sm:text-base">
              vacant
            </span>
          )}
        </span>

        {/* Flourish that unfurls on hover. */}
        <span
          aria-hidden
          className="relative flex h-4 items-center justify-end"
        >
          <span className="block h-px w-8 origin-right scale-x-0 bg-linear-to-l from-gold/80 to-transparent transition-transform duration-300 group-hover/row:scale-x-100" />
          <span className="absolute right-0 size-1.5 rotate-45 scale-0 bg-gold/80 transition-transform duration-300 group-hover/row:scale-100" />
        </span>
      </div>

      {/* Ruling line beneath each entry — gilds on hover. */}
      <span
        aria-hidden
        className="absolute right-4 bottom-0 left-4 h-px bg-gold/15 transition-colors duration-300 group-hover/row:bg-gold/55 sm:right-6 sm:left-6"
      />
    </li>
  )
}

export function HallContent() {
  const ref = useRef<HTMLDivElement>(null)

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
          // Rod-cap finials twinkle on a slow out-of-phase loop.
          q('[data-finial]').forEach((dot, i) => {
            gsap.to(dot, {
              opacity: 0.55,
              duration: 1.8 + (i % 2) * 0.6,
              delay: i * 0.4,
              ease: 'sine.inOut',
              repeat: -1,
              yoyo: true,
            })
          })
        }

        const tl = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete: startAmbient,
        })
        tl.from(q('[data-h="kicker"]'), {
          y: -18,
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
        })
          .from(
            q('[data-h="title"]'),
            { y: 26, opacity: 0, duration: 0.6 },
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
          // Scroll unfurls from the top rod.
          .from(
            q('[data-h="scroll"]'),
            {
              scaleY: 0,
              opacity: 0,
              duration: 0.7,
              ease: 'power2.out',
              transformOrigin: '50% 0%',
            },
            '-=0.15',
          )
          // Rod caps + finials snap in.
          .from(
            q('[data-rod]'),
            {
              scaleX: 0,
              opacity: 0,
              duration: 0.45,
              stagger: 0.08,
              ease: 'power2.out',
              transformOrigin: '50% 50%',
            },
            '-=0.4',
          )
          // Entries stagger in line by line.
          .from(
            q('[data-entry]'),
            {
              x: -16,
              opacity: 0,
              duration: 0.45,
              stagger: 0.06,
              ease: 'power2.out',
            },
            '-=0.25',
          )
          .from(
            q('[data-h="closing"]'),
            { y: 20, opacity: 0, duration: 0.5 },
            '-=0.2',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  const filled = PATRONS.length

  return (
    <div ref={ref} className="flex flex-col gap-6">
      {/* Header. */}
      <header className="flex flex-col items-center gap-2 text-center">
        <p
          data-h="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          The Hall of Patrons
        </p>
        <h1
          data-h="title"
          className="font-display text-3xl tracking-wide text-balance sm:text-4xl"
        >
          The <span className="text-primary">honour roll</span>
        </h1>
        <div data-h="rule">
          <OrnamentDivider className="w-48 max-w-[70vw] text-gold/60" />
        </div>
        <p
          data-h="lede"
          className="max-w-md text-pretty text-muted-foreground"
        >
          Ten lines — one for each Founding patron of Coup Online.
        </p>
      </header>

      {/* The scroll. */}
      <section
        data-h="scroll"
        aria-label="Founding patrons honour roll"
        className="relative mx-auto w-full max-w-md"
      >
        {/* Top rod cap. */}
        <div
          data-rod
          aria-hidden
          className="relative mx-auto flex h-3 w-[110%] translate-x-[-4.5%] items-center justify-between rounded-full bg-linear-to-b from-gold/45 via-gold/25 to-gold/45 shadow-[0_2px_6px_rgba(245,170,50,0.18)]"
        >
          <span
            data-finial
            className="-ml-1 block size-3 rotate-45 rounded-sm border border-gold/55 bg-card shadow-[0_0_8px_2px_rgba(245,170,50,0.35)]"
          />
          <span
            data-finial
            className="-mr-1 block size-3 rotate-45 rounded-sm border border-gold/55 bg-card shadow-[0_0_8px_2px_rgba(245,170,50,0.35)]"
          />
        </div>

        {/* The parchment field. */}
        <div className="relative overflow-hidden border-x border-gold/35 bg-linear-to-b from-card/95 via-card to-card/95">
          {/* Inner gilt border — sits above the scrollable list as a frame. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-2 z-10 border border-gold/15"
          />
          {/* The ten lines — scrollable inside the parchment field so the
              whole page fits in the viewport. Slim gold-tinted webkit
              scrollbar; top + bottom fade-edge mask. */}
          <ol className="relative flex max-h-72 flex-col overflow-y-auto py-3 mask-[linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gold/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1 sm:max-h-80">
            {NUMERALS.map((numeral, i) => (
              <Entry key={numeral} numeral={numeral} name={PATRONS[i]} />
            ))}
          </ol>
        </div>

        {/* Bottom rod cap. */}
        <div
          data-rod
          aria-hidden
          className="relative mx-auto flex h-3 w-[110%] translate-x-[-4.5%] items-center justify-between rounded-full bg-linear-to-b from-gold/45 via-gold/25 to-gold/45 shadow-[0_-2px_6px_rgba(245,170,50,0.18)]"
        >
          <span
            data-finial
            className="-ml-1 block size-3 rotate-45 rounded-sm border border-gold/55 bg-card shadow-[0_0_8px_2px_rgba(245,170,50,0.35)]"
          />
          <span
            data-finial
            className="-mr-1 block size-3 rotate-45 rounded-sm border border-gold/55 bg-card shadow-[0_0_8px_2px_rgba(245,170,50,0.35)]"
          />
        </div>
      </section>

      {/* Close. */}
      <div
        data-h="closing"
        className="flex flex-col items-center gap-3 text-center"
      >
        <p className="font-display text-xs tracking-[0.2em] text-gold uppercase tabular-nums">
          {filled} of {FOUNDING_LIMIT} lines inscribed
        </p>
        <p className="max-w-xl text-pretty text-muted-foreground">
          The patronage programme is yet to open. The first ten to support
          the project will be remembered as Founding patrons.
        </p>
        <Button asChild size="lg" className={CTA_CLASS}>
          <Link href="/support">Become a patron</Link>
        </Button>
      </div>
    </div>
  )
}
