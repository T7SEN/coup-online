'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'

// Per-navigation enter animation for the site pages (Home / Rules /
// Leaderboard / Profile). Unlike layout.tsx, a template.tsx re-mounts on every
// route change — so this cross-fade plays on each navigation.
//
// Opacity only, deliberately: a `transform` on this wrapper would make it the
// containing block for `position: fixed` descendants (e.g. the scroll-to-top
// button), shifting them off the viewport. A pure fade avoids that. The
// wrapper is `flex flex-1 flex-col` so it doesn't break the layout's flex
// chain — the home page's `<main flex-1>` still stretches. Reduced-motion
// visitors get the page with no fade. references/animations.md.
export default function SiteTemplate({
  children,
}: {
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap.from(el, { opacity: 0, duration: 0.35, ease: 'power2.out' })
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      {children}
    </div>
  )
}
