'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { cn } from '@/lib/utils'

// A depleting countdown ring for the 15s challenge / block windows
// (SKILL.md § 3.2). The SVG stroke drains from full to empty over the time
// remaining; the ring turns oxblood and pulses under 5s. The stroke is driven
// by GSAP for a smooth 60fps drain rather than the 250ms React clock.
// references/animations.md.

const SIZE = 46
const STROKE = 4
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function TimerRing({
  endsAt,
  seconds,
  totalMs = 15_000,
}: {
  endsAt: number
  seconds: number
  totalMs?: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const urgent = seconds <= 5

  // Drain the stroke over whatever time is left when this window opened.
  useGSAP(
    () => {
      const ring = ringRef.current
      if (!ring) return
      const remainingMs = Math.max(0, endsAt - Date.now())
      const remainingFrac = Math.min(1, remainingMs / totalMs)
      // strokeDashoffset 0 = full ring drawn, CIRCUMFERENCE = empty.
      const fromOffset = CIRCUMFERENCE * (1 - remainingFrac)
      if (!MOTION_ENABLED) {
        gsap.set(ring, { strokeDashoffset: fromOffset })
        return
      }
      const mm = gsap.matchMedia()
      let animated = false
      mm.add(NO_REDUCED_MOTION, () => {
        animated = true
        gsap.fromTo(
          ring,
          { strokeDashoffset: fromOffset },
          { strokeDashoffset: CIRCUMFERENCE, duration: remainingMs / 1000, ease: 'none' },
        )
      })
      if (!animated) gsap.set(ring, { strokeDashoffset: fromOffset })
      return () => mm.revert()
    },
    { dependencies: [endsAt, totalMs], scope: rootRef },
  )

  // Urgency pulse under 5s.
  useGSAP(
    () => {
      const root = rootRef.current
      if (!root || !MOTION_ENABLED || !urgent) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.fromTo(
          root,
          { scale: 1 },
          { scale: 1.12, duration: 0.5, repeat: -1, yoyo: true, ease: 'sine.inOut' },
        )
      })
      return () => mm.revert()
    },
    { dependencies: [urgent], scope: rootRef },
  )

  return (
    <div
      ref={rootRef}
      className="relative inline-flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
      aria-label={`${seconds} seconds remaining`}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-table-foreground/20"
        />
        <circle
          ref={ringRef}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          style={{ strokeDashoffset: 0 }}
          className={cn('transition-colors duration-300', urgent ? 'text-destructive' : 'text-gold')}
        />
      </svg>
      <span
        className={cn(
          'absolute font-display text-sm tabular-nums',
          urgent ? 'text-destructive' : 'text-table-foreground',
        )}
      >
        {seconds}
      </span>
    </div>
  )
}
