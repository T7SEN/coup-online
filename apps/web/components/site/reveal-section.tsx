'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'

// Fades + rises its children when they scroll into view — a uniform, light
// entrance for the Rules page sections. ScrollTrigger (registered in
// components/motion.tsx); gated on reduced motion, so reduced-motion visitors
// simply get the content at rest. references/animations.md.
//
// This is the page's one client island: the Rules page itself is a static
// Server Component, and this wrapper is dynamically loaded into it.
export function RevealSection({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 0.55,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        })
      })
      return () => mm.revert()
    },
    { scope: ref },
  )
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
