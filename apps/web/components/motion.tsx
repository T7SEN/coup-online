'use client'

import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

// GSAP motion primitives. SKILL.md § 2 — GSAP via the `useGSAP` hook (correct
// React lifecycle + cleanup). Every animation is gated on this media query, so
// a reduced-motion visitor lands on the final state with no movement.
// references/animations.md.
export const NO_REDUCED_MOTION = '(prefers-reduced-motion: no-preference)'

// Global motion kill-switch. The GSAP animations need a tuning pass — until
// then they are switched off here and the app runs fully static (every state
// change stays instant and correct). Flip to `true` to re-enable.
// references/animations.md.
export const MOTION_ENABLED: boolean = false

// Fades + slides its children up on mount — wraps each action bar so the bar
// eases in when its phase begins.
export function AppearOnMount({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.from(el, { y: 14, opacity: 0, duration: 0.28, ease: 'power2.out' })
      })
      return () => mm.revert()
    },
    { scope: ref },
  )
  return <div ref={ref}>{children}</div>
}

// An integer that rolls to its new value whenever `value` changes — coin counts.
// Reduced motion: snaps straight to the new value.
export function CoinCount({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  useGSAP(
    () => {
      if (shown === value) return
      if (!MOTION_ENABLED) {
        setShown(value)
        return
      }
      const mm = gsap.matchMedia()
      let animated = false
      mm.add(NO_REDUCED_MOTION, () => {
        animated = true
        const proxy = { n: shown }
        gsap.to(proxy, {
          n: value,
          duration: 0.45,
          ease: 'power1.out',
          onUpdate: () => setShown(Math.round(proxy.n)),
        })
      })
      if (!animated) setShown(value)
      return () => mm.revert()
    },
    { dependencies: [value] },
  )
  return <>{shown}</>
}
