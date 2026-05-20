'use client'

/* eslint-disable @next/next/no-img-element -- the character-card SVGs are
   local, trusted assets in public/cards; next/image SVG handling needs the
   global dangerouslyAllowSVG flag, which we don't want to enable. */

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { SectionHeading } from '@/components/site/section-heading'

// The turn loop, distilled to three beats. SKILL.md § 3.2 / § 4. The stage
// above plays these out; the active beat brightens (and a subtle panel fades
// in behind it) while the other two stay faded.
const BEATS = [
  {
    label: 'Claim',
    title: 'Claim a power',
    body: 'On your turn you act. The strongest moves demand a character — but nobody checks your hand. Hold the card, or simply say you do.',
  },
  {
    label: 'Challenge',
    title: 'Call the bluff',
    body: 'Doubt a claim? Challenge it. A wrong call costs you an influence; an exposed liar pays the same.',
  },
  {
    label: 'Lose influence',
    title: 'Outlast the court',
    body: 'Every lost challenge — and every coup — strips an influence. Lose both your cards and you are out. The last player standing wins.',
  },
]

// Inactive beats sit at this opacity; the active one rides at full.
const BEAT_FADED = 0.3

// "How it plays" — an animated turn demo. A looping, scroll-triggered stage
// plays out one turn: a card is claimed (lifts, glows), the claim is
// challenged (the card flips face-up — a bluff: not the Duke), and the bluffer
// loses that influence (the card dims and tilts away). Beneath the stage, the
// three beat descriptions track along: each beat's text brightens and a subtle
// backing panel fades in behind it — and crucially the highlight crossfades
// *concurrently with, and at the same pace as*, its card action, so the row
// stays in sync with the stage.
//
// The timeline is self-resetting (a `.set()` block at the top) so `repeat: -1`
// loops cleanly; the card "flip" is a 2D `scaleX` squash with a face-swap at
// the edge-on midpoint — no 3D rotation. Gated on `gsap.matchMedia()`; reduced-
// motion visitors get a static face-down card and the readable beat text.
// references/animations.md.
export function HowItPlaysSection() {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const q = gsap.utils.selector(el)
      const mm = gsap.matchMedia()

      mm.add(NO_REDUCED_MOTION, () => {
        const card = q('[data-htp-card]')[0]
        const back = q('[data-htp-back]')[0]
        const front = q('[data-htp-front]')[0]
        const glow = q('[data-htp-glow]')[0]
        const capClaim = q('[data-htp-cap="claim"]')[0]
        const capChallenge = q('[data-htp-cap="challenge"]')[0]
        const capLoss = q('[data-htp-cap="loss"]')[0]
        const [bg1, bg2, bg3] = q('[data-htp-beat-bg]')
        const [txt1, txt2, txt3] = q('[data-htp-beat-text]')
        if (
          !card ||
          !back ||
          !front ||
          !glow ||
          !capClaim ||
          !capChallenge ||
          !capLoss ||
          !bg1 ||
          !bg2 ||
          !bg3 ||
          !txt1 ||
          !txt2 ||
          !txt3
        ) {
          return
        }
        const caps = [capClaim, capChallenge, capLoss]

        // Fade the beats immediately (before the section scrolls into view) so
        // the row never flashes from full to faded when the demo starts.
        gsap.set([txt1, txt2, txt3], { opacity: BEAT_FADED })

        // Heading entrance — independent of the looping demo.
        gsap.from(q('[data-htp="heading"]'), {
          y: 30,
          opacity: 0,
          duration: 0.5,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 75%' },
        })

        gsap
          .timeline({
            repeat: -1,
            repeatDelay: 1.6,
            defaults: { ease: 'power2.out' },
            scrollTrigger: {
              trigger: el,
              start: 'top 65%',
              toggleActions: 'play pause resume pause',
            },
          })
          // Reset — runs at the top of every loop.
          .set(card, { y: 0, rotation: 0, scaleX: 1, opacity: 1 })
          .set(back, { opacity: 1 })
          .set(front, { opacity: 0 })
          .set(glow, { opacity: 0, scale: 0.8 })
          .set(caps, { opacity: 0, y: 8 })
          .set([bg1, bg2, bg3], { opacity: 0 })
          .set([txt1, txt2, txt3], { opacity: BEAT_FADED })
          // Beat 1 — the claim. Highlight rises as the card lifts.
          .to(card, { y: -18, duration: 0.5 })
          .to(glow, { opacity: 1, scale: 1, duration: 0.5 }, '<')
          .to(bg1, { opacity: 1, duration: 0.5 }, '<')
          .to(txt1, { opacity: 1, duration: 0.5 }, '<')
          .to(capClaim, { opacity: 1, y: 0, duration: 0.35 }, '-=0.15')
          // Beat 2 — the challenge call, then the flip.
          .to(capClaim, { opacity: 0, y: -8, duration: 0.25 }, '+=1.1')
          .to(capChallenge, { opacity: 1, y: 0, duration: 0.3 }, '-=0.05')
          .addLabel('beat2', '<')
          .to(card, { scaleX: 0, duration: 0.2, ease: 'power2.in' }, '+=0.1')
          .addLabel('flip', '<')
          // Text row — switches to beat 2 shortly after the challenge call
          // (`beat2+=<delay>`), decoupled from the card flip below. Tweak the
          // delay and `duration` together to re-pace the beat-1 → beat-2 move.
          .to(bg1, { opacity: 0, duration: 0.4 }, 'beat2+=0.2')
          .to(bg2, { opacity: 1, duration: 0.4 }, 'beat2+=0.2')
          .to(txt1, { opacity: BEAT_FADED, duration: 0.4 }, 'beat2+=0.2')
          .to(txt2, { opacity: 1, duration: 0.4 }, 'beat2+=0.2')
          // Card flip — timing unchanged (anchored to the 'flip' label so the
          // text row above can be re-timed without disturbing it).
          .set(back, { opacity: 0 }, 'flip+=0.45')
          .set(front, { opacity: 1 }, 'flip+=0.45')
          .to(card, { scaleX: 1, duration: 0.2, ease: 'power2.out' }, 'flip+=0.45')
          .to(card, { rotation: -4, duration: 0.07, repeat: 3, yoyo: true })
          .set(card, { rotation: 0 })
          // Beat 3 — the influence is lost. The highlight crossfades
          // concurrently with the card's slump, at the same duration.
          .to(capChallenge, { opacity: 0, y: -8, duration: 0.25 }, '+=1')
          .to(capLoss, { opacity: 1, y: 0, duration: 0.35 }, '-=0.05')
          .to(glow, { opacity: 0, duration: 0.4 }, '<')
          .to(card, {
            rotation: 18,
            y: 6,
            opacity: 0.5,
            duration: 0.6,
            ease: 'power2.inOut',
          })
          .to(bg2, { opacity: 0, duration: 0.6 }, '<')
          .to(bg3, { opacity: 1, duration: 0.6 }, '<')
          .to(txt2, { opacity: BEAT_FADED, duration: 0.6 }, '<')
          .to(txt3, { opacity: 1, duration: 0.6 }, '<')
      })

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
        <div data-htp="heading">
          <SectionHeading kicker="One turn, played out" title="How it plays" />
        </div>

        {/* Animated stage — decorative; the beat list below carries the text. */}
        <div
          data-htp-stage
          aria-hidden
          className="mt-10 flex flex-col items-center gap-4"
        >
          <div className="relative h-7 w-full">
            <span
              data-htp-cap="claim"
              className="absolute inset-x-0 text-center text-sm text-gold italic opacity-0"
            >
              “I have the Duke.”
            </span>
            <span
              data-htp-cap="challenge"
              className="absolute inset-x-0 text-center font-display text-sm font-semibold tracking-[0.2em] text-primary uppercase opacity-0"
            >
              Challenged!
            </span>
            <span
              data-htp-cap="loss"
              className="absolute inset-x-0 text-center text-sm text-muted-foreground opacity-0"
            >
              A bluff exposed — an influence is lost.
            </span>
          </div>

          <div className="relative flex h-64 items-center justify-center sm:h-72">
            <div
              data-htp-glow
              className="absolute inset-0 m-auto size-56 rounded-full opacity-0 sm:size-64"
              style={{
                background:
                  'radial-gradient(circle, oklch(0.74 0.13 84 / 0.5), transparent 70%)',
              }}
            />
            <div data-htp-card className="relative aspect-2/3 w-36 sm:w-40">
              <img
                data-htp-back
                src="/cards/back.svg"
                alt=""
                draggable={false}
                className="absolute inset-0 size-full rounded-lg border border-gold/25 bg-card object-cover shadow-2xl select-none"
              />
              <img
                data-htp-front
                src="/cards/contessa.svg"
                alt=""
                draggable={false}
                className="absolute inset-0 size-full rounded-lg border border-gold/25 bg-card object-cover opacity-0 shadow-2xl select-none"
              />
            </div>
          </div>
        </div>

        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {BEATS.map((beat) => (
            <li key={beat.title} data-htp-beat className="relative">
              {/* Backing panel — fades in only while this beat is active. */}
              <div
                data-htp-beat-bg
                className="absolute inset-0 rounded-md border border-gold/25 bg-foreground/8 opacity-0 shadow-md"
              />
              <div
                data-htp-beat-text
                className="relative flex h-full flex-col items-center justify-center gap-2 px-5 py-6 text-center"
              >
                <span className="text-xs font-medium tracking-[0.2em] text-gold/70 uppercase">
                  {beat.label}
                </span>
                <h3 className="font-display text-lg tracking-wide">
                  {beat.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {beat.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
