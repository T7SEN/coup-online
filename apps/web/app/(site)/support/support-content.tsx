'use client'

import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Hash,
  ImagePlus,
  Landmark,
  Link2,
  type LucideIcon,
  Medal,
  Quote,
  Spade,
  Sparkles,
  Table,
  Trophy,
  Wind,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  MOTION_ENABLED,
  NO_REDUCED_MOTION,
  motionAllowed,
} from '@/components/motion'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The support page's content + motion (the page shell is ./page.tsx). A
// patronage pitch in the manuscript-court style: a monumental header, a
// gallery of privilege cards you flip through, and a close naming the one
// thing anyone can do today for free — share the game. One tier, every perk
// bundled; all purely cosmetic (Coup Online is ranked — no pay-to-win). No
// payment backend exists yet, so the programme is framed as upcoming.
//
// Sized to sit within one viewport — only one privilege card shows at a time,
// so twelve privileges cost no extra height.
//
// Motion: a useGSAP entrance (header → gallery → close), plus a second
// useGSAP keyed on the card index that slides each privilege in on a flip.
// Both gated on gsap.matchMedia(). references/animations.md.

// Gilded plaque CTA — matches the hero / closing button treatment.
const CTA_CLASS =
  'h-12 rounded-sm border border-gold/55 px-8 font-display text-sm tracking-[0.16em] uppercase shadow-md transition duration-200 hover:-translate-y-0.5 hover:border-gold hover:shadow-lg'

// Bare gold chevron flanking the privilege gallery — no button chrome, just
// the arrow. Per-side hover nudge is appended at the call site.
const ARROW_CLASS =
  'shrink-0 cursor-pointer rounded-md p-1 text-gold/70 transition duration-200 motion-reduce:transition-none hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none'

// How long each privilege card holds before the gallery auto-advances.
const AUTOPLAY_MS = 4500

// The patron privileges — one tier, every perk bundled. All cosmetic /
// recognition only.
const PRIVILEGES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: ImagePlus,
    title: 'Custom profile banner',
    desc: 'Trade your crest’s preset color for a banner image of your own.',
  },
  {
    icon: BadgeCheck,
    title: 'Supporter crest everywhere',
    desc: 'A mark of patronage beside your name — on the leaderboard, in matches, and in-game.',
  },
  {
    icon: Landmark,
    title: 'Name in the Hall of Patrons',
    desc: 'Your name enshrined on a page that honours everyone who backs the project.',
  },
  {
    icon: Sparkles,
    title: 'Gilded nickname',
    desc: 'Your nickname rendered in gold leaf wherever it appears.',
  },
  {
    icon: Wind,
    title: 'Living banner',
    desc: 'A banner that breathes — a gentle shimmer in place of a still backdrop.',
  },
  {
    icon: Quote,
    title: 'Profile motto',
    desc: 'A short line of your own choosing, displayed beneath your name.',
  },
  {
    icon: Spade,
    title: 'Card-back skin',
    desc: 'An alternate decorative back for the cards held in your hand.',
  },
  {
    icon: Trophy,
    title: 'Victory flourish',
    desc: 'A flourish that plays across the table the moment you win.',
  },
  {
    icon: Table,
    title: 'Table theme',
    desc: 'Host private rooms dressed in an alternate felt and table style.',
  },
  {
    icon: Medal,
    title: 'Founding-patron mark',
    desc: 'A distinct crest for the first ten patrons — never offered again.',
  },
  {
    icon: Hash,
    title: 'Vanity room codes',
    desc: 'Choose a memorable code for your private matches, instead of a random one.',
  },
  {
    icon: Link2,
    title: 'Vanity profile URL',
    desc: 'A clean, custom link to your profile — yours to share.',
  },
]

// Open the native share sheet, or copy the link as a fallback.
async function shareSite() {
  const url = window.location.origin
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Coup Online',
        text: 'Play Coup Online — free real-time Coup, 3–6 players.',
        url,
      })
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied — thanks for spreading the word!')
    }
  } catch {
    // Share dismissed, or clipboard blocked — nothing to do.
  }
}

export function SupportContent() {
  const ref = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dirRef = useRef<1 | -1>(1)
  const firstSwap = useRef(true)
  const [index, setIndex] = useState(0)
  // `paused` — hover (temporary). `stopped` — the visitor took manual
  // control, so auto-advance ends for good.
  const [paused, setPaused] = useState(false)
  const [stopped, setStopped] = useState(false)

  const total = PRIVILEGES.length
  const current = PRIVILEGES[index]
  const Icon = current.icon

  function goTo(next: number) {
    setStopped(true)
    dirRef.current = next >= index ? 1 : -1
    setIndex(((next % total) + total) % total)
  }
  function step(delta: 1 | -1) {
    setStopped(true)
    dirRef.current = delta
    setIndex((i) => ((i + delta) % total + total) % total)
  }

  // Auto-advance the gallery — paused while hovered, stopped for good once
  // the visitor navigates manually, and disabled entirely under reduced
  // motion. setIndex runs inside the interval callback, never synchronously
  // in the effect body.
  useEffect(() => {
    if (stopped || paused || !motionAllowed()) return
    const id = window.setInterval(() => {
      dirRef.current = 1
      setIndex((i) => (i + 1) % total)
    }, AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [stopped, paused, total])

  // Entrance — header, gallery, close.
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
          .from(q('[data-s="kicker"]'), {
            y: -18,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
          })
          .from(
            q('[data-s="title"]'),
            { y: 24, opacity: 0, duration: 0.55 },
            '-=0.25',
          )
          .from(
            q('[data-s="rule"]'),
            { scaleX: 0, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.25',
          )
          .from(
            q('[data-s="lede"]'),
            { y: 16, opacity: 0, duration: 0.5 },
            '-=0.3',
          )
          .from(
            q('[data-s="charter"]'),
            { y: 28, opacity: 0, duration: 0.55 },
            '-=0.1',
          )
          .from(
            q('[data-s="closing"]'),
            { y: 20, opacity: 0, duration: 0.5 },
            '-=0.1',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  // Card swap — slide the privilege in whenever the index changes (skipped on
  // first mount; the entrance covers that).
  useGSAP(
    () => {
      if (firstSwap.current) {
        firstSwap.current = false
        return
      }
      if (!MOTION_ENABLED) return
      const card = cardRef.current
      if (!card) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.from(card, {
          opacity: 0,
          x: dirRef.current * 28,
          duration: 0.3,
          ease: 'power2.out',
        })
      })
      return () => mm.revert()
    },
    { dependencies: [index] },
  )

  return (
    <div ref={ref} className="flex flex-col gap-6">
      {/* Header — the pitch, and the reason it matters. */}
      <header className="flex flex-col items-center gap-2 text-center">
        <p
          data-s="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          Support Coup Online
        </p>
        <h1
          data-s="title"
          className="font-display text-3xl leading-tight tracking-wide text-balance sm:text-4xl"
        >
          Become a <span className="text-primary">patron</span> of the court
        </h1>
        <div data-s="rule">
          <OrnamentDivider className="w-48 max-w-[70vw] text-gold/60" />
        </div>
        <p
          data-s="lede"
          className="max-w-xl text-pretty text-muted-foreground"
        >
          Coup Online is built — and paid for — by a single student, and stays
          free for everyone. A patronage programme is on its way for those
          who&rsquo;d like to help carry the cost.
        </p>
      </header>

      {/* The charter of privileges — a gallery, one card at a time. */}
      <section
        data-s="charter"
        className="flex flex-col items-center gap-4"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg tracking-wide">
              A patron&rsquo;s privileges
            </h2>
            <span className="rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-medium tracking-widest text-muted-foreground uppercase">
              Coming soon
            </span>
          </div>
          <div className="h-px w-12 bg-gold/40" />
        </div>

        {/* The privilege card, flanked by the gallery arrows. */}
        <div className="flex w-full items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Previous privilege"
            onClick={() => step(-1)}
            className={cn(ARROW_CLASS, 'hover:-translate-x-0.5')}
          >
            <ChevronLeft className="size-8" aria-hidden />
          </button>

          <div className="flex min-h-48 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-gold/40 bg-gold/8 px-6 py-7 shadow-md">
            <div
              ref={cardRef}
              className="flex flex-col items-center gap-3 text-center"
            >
              <span className="flex size-12 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold">
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-xl tracking-wide">
                  {current.title}
                </h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {current.desc}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Next privilege"
            onClick={() => step(1)}
            className={cn(ARROW_CLASS, 'hover:translate-x-0.5')}
          >
            <ChevronRight className="size-8" aria-hidden />
          </button>
        </div>

        {/* Dot navigation. */}
        <div className="flex items-center justify-center gap-1.5">
          {PRIVILEGES.map((p, i) => (
            <button
              key={p.title}
              type="button"
              aria-label={`Show: ${p.title}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={cn(
                'size-2 cursor-pointer rounded-full transition-colors',
                i === index ? 'bg-gold' : 'bg-gold/25 hover:bg-gold/55',
              )}
            />
          ))}
        </div>
      </section>

      {/* Close — the support that costs nothing. */}
      <div
        data-s="closing"
        className="flex flex-col items-center gap-3 text-center"
      >
        <p className="max-w-xl text-pretty text-muted-foreground">
          Not ready to be a patron? Sharing Coup Online with friends costs
          nothing — and helps the project just as much.
        </p>
        <Button
          size="lg"
          className={CTA_CLASS}
          onClick={() => void shareSite()}
        >
          Share the game
        </Button>
      </div>
    </div>
  )
}
