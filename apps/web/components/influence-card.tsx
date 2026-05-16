'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import type { Influence } from '@coup-online/protocol'
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
// ratio — so the slots are an exact 2:3, and bg-cover fits with no crop.
const SIZE_CLASS: Record<Size, string> = {
  sm: 'w-20 aspect-[2/3]',
  md: 'w-32 aspect-[2/3]',
}

function cardFile(influence: Influence): string {
  return influence.status === 'hidden'
    ? 'back.svg'
    : `${influence.kind.toLowerCase()}.svg`
}

function cardLabel(influence: Influence): string {
  if (influence.status === 'hidden') return 'Hidden card'
  return influence.status === 'revealed'
    ? `${influence.kind}, revealed`
    : influence.kind
}

// The static card visual — the SVG art from public/cards/. `sizeClassName`
// controls dimensions. When `animateReveal` is set, the card flips face-up the
// moment it transitions to `revealed` (a challenge or influence loss).
function CardFace({
  influence,
  sizeClassName,
  animateReveal = false,
}: {
  influence: Influence
  sizeClassName: string
  animateReveal?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prevStatus = useRef(influence.status)
  useGSAP(
    () => {
      const becameRevealed =
        prevStatus.current !== 'revealed' && influence.status === 'revealed'
      prevStatus.current = influence.status
      const el = ref.current
      if (!MOTION_ENABLED || !animateReveal || !becameRevealed || !el) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.from(el, {
          rotationY: 90,
          scale: 0.82,
          opacity: 0.35,
          duration: 0.5,
          ease: 'back.out(1.3)',
          transformPerspective: 700,
        })
      })
      return () => mm.revert()
    },
    { dependencies: [influence.status], scope: ref },
  )

  const lost = influence.status === 'revealed'
  return (
    <div
      ref={ref}
      style={{ backgroundImage: `url(/cards/${cardFile(influence)})` }}
      className={cn(
        'relative overflow-hidden rounded-xl bg-cover bg-center shadow-sm ring-1 ring-foreground/10',
        sizeClassName,
        lost && 'opacity-55 grayscale',
      )}
    >
      {/* Lost cards get a diagonal strike, clipped to the card by overflow-hidden. */}
      {lost && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 h-px w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-[55deg] bg-white/90" />
      )}
    </div>
  )
}

// One influence card. Clicking it opens an enlarged lightbox; click the big
// card, the backdrop, or press Escape to close. references/design-system.md.
//
// Protocol Influence states:
//   hidden    — another player's face-down card → the card back.
//   face-down — the viewer's own card → that character's art.
//   revealed  — a lost card → the character art, faded, greyed and struck.
export function InfluenceCard({
  influence,
  size = 'sm',
  className,
}: {
  influence: Influence
  size?: Size
  className?: string
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
        <CardFace influence={influence} sizeClassName={SIZE_CLASS[size]} animateReveal />
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
          />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
