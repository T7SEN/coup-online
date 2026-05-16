'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import type { PlayerSeat } from '@coup-online/protocol'
import { CoinCount, MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { InfluenceCard } from './influence-card'

// The viewer's own seat — shown large along the bottom of the table: the two
// cards at `md` size, the name, coins, and turn state. Gold border = your turn;
// faded = eliminated. A brief pulse plays when the turn lands on you.
// references/design-system.md.
export function PlayerHand({
  seat,
  isTurn,
}: {
  seat: PlayerSeat
  isTurn: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const el = ref.current
      if (!MOTION_ENABLED || !isTurn || !seat.isAlive || !el) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.fromTo(
          el,
          { scale: 1 },
          { scale: 1.03, duration: 0.24, yoyo: true, repeat: 1, ease: 'power1.inOut' },
        )
      })
      return () => mm.revert()
    },
    { dependencies: [isTurn], scope: ref },
  )

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors',
        isTurn && seat.isAlive && 'border-gold ring-1 ring-gold/45',
        !seat.isAlive && 'opacity-65',
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-[0.6rem]">
              {seat.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span dir="auto" className="font-medium">
            {seat.displayName}
          </span>
          <span className="text-xs text-muted-foreground">(you)</span>
        </span>
        <span
          className="flex items-center gap-1 tabular-nums"
          title={`${seat.coins} coin${seat.coins === 1 ? '' : 's'}`}
        >
          <span className="size-2.5 rounded-full bg-gold ring-1 ring-gold-foreground/25" />
          <CoinCount value={seat.coins} />
        </span>
        {isTurn && seat.isAlive && (
          <Badge variant="outline" className="border-gold/55 text-gold-foreground">
            Your turn
          </Badge>
        )}
        {seat.isDisconnected && seat.isAlive && (
          <Badge variant="outline" className="text-muted-foreground">
            disconnected
          </Badge>
        )}
        {!seat.isAlive && <Badge variant="destructive">eliminated</Badge>}
      </div>
      <div className="flex justify-center gap-3">
        {seat.influence.map((inf, i) => (
          <InfluenceCard key={i} influence={inf} size="md" />
        ))}
      </div>
    </div>
  )
}
