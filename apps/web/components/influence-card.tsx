'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import type { Influence } from '@coup-online/protocol'
import { CardBackArt } from '@/components/card-back-art'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md'

// Card-slot dimensions. The art in public/cards/ is authored 400×600 — a 2:3
// ratio — so the slots are an exact 2:3 and bg-cover fits with no crop.
const SIZE_CLASS: Record<Size, string> = {
  sm: 'w-20 aspect-[2/3]',
  md: 'w-32 aspect-[2/3]',
}

// A true two-faced flip card:
//   front — the named character card, public/cards/<name>.svg (the art already
//           carries the card's name).
//   back  — always public/cards/back.svg.
// `hidden` cards (another player's face-down card) have no known kind, so the
// front face stays blank and the back faces the viewer. When a card transitions
// hidden → revealed the inner element rotates 180° (back → front) — a genuine
// card flip, not a one-sided swing. SKILL.md § 3.1, references/animations.md.
function frontFile(influence: Influence): string | null {
  return influence.status === 'hidden' ? null : `${influence.kind.toLowerCase()}.svg`
}

function cardLabel(influence: Influence): string {
  if (influence.status === 'hidden') return 'Hidden card'
  return influence.status === 'revealed'
    ? `${influence.kind}, revealed`
    : influence.kind
}

function CardFace({
  influence,
  sizeClassName,
  animateReveal = false,
  cardBackSkin,
}: {
  influence: Influence
  sizeClassName: string
  animateReveal?: boolean
  // The patron-chosen back skin for the seat that OWNS this card. Null /
  // undefined / unknown values fall back to the default parchment back via
  // CardBackArt.
  cardBackSkin?: string | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const showsBack = influence.status === 'hidden'
  const prevShowsBack = useRef(showsBack)
  const lost = influence.status === 'revealed'
  const front = frontFile(influence)

  useGSAP(
    () => {
      const inner = innerRef.current
      if (!inner) return
      const wasBack = prevShowsBack.current
      prevShowsBack.current = showsBack
      // rotationY 0 = front faces the viewer, 180 = back faces the viewer.
      const target = showsBack ? 180 : 0
      if (!MOTION_ENABLED || !animateReveal) {
        gsap.set(inner, { rotationY: target })
        return
      }
      const mm = gsap.matchMedia()
      let animated = false
      mm.add(NO_REDUCED_MOTION, () => {
        animated = true
        if (wasBack === showsBack) {
          gsap.set(inner, { rotationY: target })
          return
        }
        // The card flipped (hidden → revealed) — rotate back → front with a
        // perspective sweep, then a small landing thump.
        gsap.fromTo(
          inner,
          { rotationY: wasBack ? 180 : 0 },
          { rotationY: target, duration: 0.6, ease: 'back.out(1.4)', transformPerspective: 800 },
        )
        gsap.fromTo(
          inner,
          { scale: 0.86 },
          { scale: 1, duration: 0.45, ease: 'back.out(2)', delay: 0.16 },
        )
      })
      if (!animated) gsap.set(inner, { rotationY: target })
      return () => mm.revert()
    },
    { dependencies: [showsBack], scope: wrapRef },
  )

  return (
    <div
      ref={wrapRef}
      className={cn('relative', sizeClassName)}
      style={{ perspective: '800px' }}
    >
      <div
        ref={innerRef}
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front — the named character card. */}
        <div
          className={cn(
            'absolute inset-0 overflow-hidden rounded-xl bg-cover bg-center shadow-sm ring-1 ring-foreground/10',
            lost && 'opacity-55 grayscale',
          )}
          style={{
            backfaceVisibility: 'hidden',
            backgroundImage: front ? `url(/cards/${front})` : undefined,
          }}
        >
          {/* Lost cards get a diagonal strike, clipped by overflow-hidden. */}
          {lost && (
            <span className="pointer-events-none absolute top-1/2 left-1/2 h-px w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-[55deg] bg-white/90" />
          )}
        </div>
        {/* Back — patron-chosen skin if any, default parchment otherwise. */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/10"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <CardBackArt skin={cardBackSkin} />
        </div>
      </div>
    </div>
  )
}

// One influence card. Clicking it opens an enlarged lightbox; click the big
// card, the backdrop, or press Escape to close. references/design-system.md.
//
// Protocol Influence states:
//   hidden    — another player's face-down card → the card back.
//   face-down — the viewer's own card → that character's front art.
//   revealed  — a lost card → the character art, faded, greyed and struck.
export function InfluenceCard({
  influence,
  size = 'sm',
  className,
  cardBackSkin,
}: {
  influence: Influence
  size?: Size
  className?: string
  // Patron skin chosen by the card's owner; threaded through from
  // `PlayerSeat.cardBackSkin`. Undefined / null = the default back.
  cardBackSkin?: string | null
}) {
  const label = cardLabel(influence)
  return (
    <Dialog>
      <DialogTrigger
        data-card
        aria-label={`Enlarge the ${label} card`}
        className={cn(
          'shrink-0 cursor-pointer rounded-xl outline-none transition-transform hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <CardFace
          influence={influence}
          sizeClassName={SIZE_CLASS[size]}
          animateReveal
          cardBackSkin={cardBackSkin}
        />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogClose
          aria-label="Close enlarged card"
          className="cursor-pointer rounded-2xl outline-none"
        >
          <CardFace
            influence={influence}
            sizeClassName="aspect-[2/3] w-64 max-w-[80vw]"
            cardBackSkin={cardBackSkin}
          />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
