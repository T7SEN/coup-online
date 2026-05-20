'use client'

import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// ScrollTrigger drives the landing-page section entrances in
// components/site/*-section.tsx. Free GSAP plugin; registered here once (this
// module is the GSAP plugin-setup hub) — the section files import this module
// for the reduced-motion constants below, which runs this registration. Safe
// under SSR: the plugin only touches the DOM when a trigger is created inside
// a useGSAP scope. references/animations.md.
gsap.registerPlugin(ScrollTrigger)

// GSAP motion primitives. SKILL.md § 2 — GSAP via the `useGSAP` hook (correct
// React lifecycle + cleanup). Every animation is gated on this media query, so
// a reduced-motion visitor lands on the final state with no movement. Animate
// transform + opacity only — never `filter: blur()` (SKILL.md § 5, mobile
// WebView repaint cost). references/animations.md.
export const NO_REDUCED_MOTION = '(prefers-reduced-motion: no-preference)'

// Global motion kill-switch. references/animations.md.
export const MOTION_ENABLED: boolean = true

// True when motion should actually play: enabled AND the visitor has not asked
// for reduced motion. Safe during SSR (no `window` → false). Used by imperative
// helpers (burstParticles) that run outside a `useGSAP` matchMedia scope.
export function motionAllowed(): boolean {
  if (!MOTION_ENABLED) return false
  if (typeof window === 'undefined') return false
  return window.matchMedia(NO_REDUCED_MOTION).matches
}

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

// A warm radial "candlelight" glow layer. Absolutely positioned, aria-hidden and
// pointer-events-none — drop it into a `relative` parent. Eases in / out as
// `active` flips. The glow is a radial-gradient + opacity/scale tween — never a
// blur filter (SKILL.md § 5). references/animations.md.
const GLOW_TONE = {
  gold: 'oklch(0.74 0.13 84 / 0.55)',
  oxblood: 'oklch(0.43 0.14 25 / 0.5)',
  ash: 'oklch(0.32 0.02 60 / 0.6)',
} as const

export function Glow({
  active,
  tone = 'gold',
  className,
}: {
  active: boolean
  tone?: keyof typeof GLOW_TONE
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const to = { opacity: active ? 1 : 0, scale: active ? 1 : 0.9 }
      if (!MOTION_ENABLED) {
        gsap.set(el, to)
        return
      }
      const mm = gsap.matchMedia()
      let animated = false
      mm.add(NO_REDUCED_MOTION, () => {
        animated = true
        gsap.to(el, { ...to, duration: 0.45, ease: 'power2.out' })
      })
      if (!animated) gsap.set(el, to)
      return () => mm.revert()
    },
    { dependencies: [active], scope: ref },
  )
  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        inset: '-22%',
        opacity: 0,
        pointerEvents: 'none',
        background: `radial-gradient(ellipse at center, ${GLOW_TONE[tone]}, transparent 70%)`,
      }}
    />
  )
}

// Imperative one-shot particle burst — a pool of small dots fly outward from
// the centre of `host` and fade, then the layer removes itself. DOM + GSAP
// only (no canvas, no WebGL). `host` must be `position: relative`. No-op under
// reduced motion or when motion is off. references/animations.md.
const PARTICLE_TONE = {
  gold: 'oklch(0.80 0.14 85)',
  oxblood: 'oklch(0.52 0.18 25)',
  ash: 'oklch(0.42 0.02 60)',
} as const

export function burstParticles(
  host: HTMLElement | null,
  opts: { count?: number; tone?: keyof typeof PARTICLE_TONE; spread?: number } = {},
): void {
  if (!host || !motionAllowed()) return
  const { count = 14, tone = 'gold', spread = 90 } = opts
  const layer = document.createElement('div')
  layer.style.cssText =
    'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:visible;z-index:40'
  host.appendChild(layer)
  const dots: HTMLElement[] = []
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div')
    dot.style.cssText = `position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:9999px;background:${PARTICLE_TONE[tone]}`
    layer.appendChild(dot)
    dots.push(dot)
  }
  gsap.to(dots, {
    x: () => gsap.utils.random(-spread, spread),
    y: () => gsap.utils.random(-spread, spread),
    scale: () => gsap.utils.random(0.3, 1.1),
    opacity: 0,
    duration: () => gsap.utils.random(0.5, 0.95),
    ease: 'power2.out',
    onComplete: () => layer.remove(),
  })
}
