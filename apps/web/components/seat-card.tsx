'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import type { PlayerSeat } from '@coup-online/protocol'
import {
  burstParticles,
  CoinCount,
  Glow,
  MOTION_ENABLED,
  NO_REDUCED_MOTION,
} from '@/components/motion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { InfluenceCard } from './influence-card'

// One opponent's seat tile. Gold border + a warm candlelight Glow when it is
// their turn; faded when eliminated. Coins render as a gold "ducat" chip.
// references/design-system.md, references/animations.md.
export function SeatCard({
  seat,
  isTurn,
}: {
  seat: PlayerSeat
  isTurn: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prevAlive = useRef(seat.isAlive)

  // Turn spotlight — a brief pulse when the turn lands on this seat.
  useGSAP(
    () => {
      const el = ref.current
      if (!MOTION_ENABLED || !isTurn || !seat.isAlive || !el) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.fromTo(
          el,
          { scale: 1 },
          { scale: 1.05, duration: 0.22, yoyo: true, repeat: 1, ease: 'power1.inOut' },
        )
      })
      return () => mm.revert()
    },
    { dependencies: [isTurn], scope: ref },
  )

  // Elimination — the seat slumps and throws an ash burst as it goes out.
  useGSAP(
    () => {
      const el = ref.current
      const wasAlive = prevAlive.current
      prevAlive.current = seat.isAlive
      if (!MOTION_ENABLED || !el || wasAlive === seat.isAlive || seat.isAlive) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.fromTo(el, { y: -4 }, { y: 0, duration: 0.55, ease: 'bounce.out' })
        burstParticles(el, { tone: 'ash', count: 16, spread: 70 })
      })
      return () => mm.revert()
    },
    { dependencies: [seat.isAlive], scope: ref },
  )

  const showBadges = !seat.isAlive || seat.isDisconnected
  return (
    <div ref={ref} className="relative">
      <Glow active={isTurn && seat.isAlive} tone="gold" />
      <div
        className={cn(
          'relative flex flex-col gap-2.5 rounded-lg border bg-card p-3 ring-1 ring-foreground/5 transition-colors',
          isTurn && seat.isAlive && 'border-gold ring-gold/40',
          !seat.isAlive && 'opacity-60',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar className="size-6">
              <AvatarFallback className="text-[0.6rem]">
                {seat.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span dir="auto" className="truncate font-medium">
              {seat.displayName}
            </span>
            {seat.isMe && (
              <span className="shrink-0 text-xs text-muted-foreground">(you)</span>
            )}
          </span>
          <span
            className="flex shrink-0 items-center gap-1 text-sm tabular-nums"
            title={`${seat.coins} coin${seat.coins === 1 ? '' : 's'}`}
          >
            <span className="size-2.5 rounded-full bg-gold ring-1 ring-gold-foreground/25" />
            <CoinCount value={seat.coins} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {seat.influence.map((inf, i) => (
            <InfluenceCard key={i} influence={inf} />
          ))}
        </div>
        {showBadges && (
          <div className="flex flex-wrap gap-1.5">
            {seat.isDisconnected && seat.isAlive && (
              <Badge variant="outline" className="text-muted-foreground">
                disconnected
              </Badge>
            )}
            {!seat.isAlive && <Badge variant="destructive">eliminated</Badge>}
          </div>
        )}
      </div>
    </div>
  )
}
