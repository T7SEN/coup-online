'use client'

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Footer } from '@/components/footer'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { Button } from '@/components/ui/button'

// Gilded CTA button — a larger sibling of the hero's, matching its plaque
// treatment so the two bookend buttons read as a pair.
const CTA_CLASS =
  'h-14 rounded-sm border border-gold/55 px-12 font-display text-base tracking-[0.18em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg'

// Closing call to action — the last section, stripped to one purpose: drive
// the click. A monumental Cinzel heading and the gilded button, centred, with
// only a faint vignette behind. It owns the footer (rendered inside the snap
// target so the CTA and footer arrive together; globals.css hides the global
// root-layout footer while `snap-home` is active).
//
// Entrance (ScrollTrigger): the vignette fades in, the kicker drops, the
// monumental heading zooms in and settles, the lede rises, the button pops,
// and the footer eases up last. Gated on `gsap.matchMedia()`.
// references/animations.md.
export function ClosingSection() {
  const router = useRouter()
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
          .timeline({
            defaults: { ease: 'power3.out' },
            scrollTrigger: { trigger: el, start: 'top 70%' },
          })
          .from(q('[data-closing="vignette"]'), {
            opacity: 0,
            duration: 0.6,
          })
          .from(
            q('[data-closing="kicker"]'),
            { y: -24, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.3',
          )
          .from(
            q('[data-closing="title"]'),
            { scale: 0.8, opacity: 0, duration: 0.7, ease: 'back.out(1.4)' },
            '-=0.15',
          )
          .from(
            q('[data-closing="lede"]'),
            { y: 24, opacity: 0, duration: 0.5 },
            '-=0.3',
          )
          .from(
            q('[data-closing="cta"]'),
            { scale: 0, opacity: 0, duration: 0.5, ease: 'back.out(2)' },
            '-=0.15',
          )
          .from(
            q('footer'),
            { y: 20, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.2',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <section
      ref={ref}
      className="relative flex min-h-svh snap-start flex-col overflow-hidden border-t border-gold/30"
    >
      {/* Edge vignette — warms and focuses the finale. */}
      <div
        data-closing="vignette"
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 78% 66% at 50% 44%, transparent 54%, oklch(0.22 0.03 60 / 0.34))',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:py-20">
        <p
          data-closing="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          The court awaits
        </p>
        <h2
          data-closing="title"
          className="font-display text-4xl leading-tight tracking-wide text-balance sm:text-6xl lg:text-7xl"
        >
          Take your <span className="text-primary">seat</span> at the table.
        </h2>
        <p
          data-closing="lede"
          className="max-w-md text-base text-pretty text-muted-foreground sm:text-lg"
        >
          Three to six players. One match, about fifteen minutes. No download —
          just nerve.
        </p>
        <div data-closing="cta" className="mt-2">
          <Button
            size="lg"
            className={CTA_CLASS}
            onClick={() => router.push('/play')}
          >
            Enter the court
          </Button>
        </div>
      </div>

      <div className="relative z-10">
        <Footer />
      </div>
    </section>
  )
}
