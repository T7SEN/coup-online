'use client'

import { useEffect } from 'react'
import { ClosingSection } from '@/components/site/closing-section'
import { HeroSection } from '@/components/site/hero-section'
import { HowItPlaysSection } from '@/components/site/how-it-plays-section'
import { TheCourtSection } from '@/components/site/the-court-section'

// Home / landing page. A sectioned pitch — each section lives in its own file
// under components/site/ and owns its own entrance animation. This file only
// composes them in order and owns the page-scoped scroll-snap toggle. The
// scroll-to-top control is shared by every (site) page — it lives in the
// route-group layout, not here.
// SKILL.md § 1 — no guest play; the per-section play panels are session-gated.
export default function HomePage() {
  // Scroll-snap is scoped to this page: globals.css keys it off `snap-home` on
  // <html>; add it while mounted, drop it on the way out so other routes
  // scroll normally.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('snap-home')
    return () => root.classList.remove('snap-home')
  }, [])

  return (
    <main className="flex-1">
      <HeroSection />
      <HowItPlaysSection />
      <TheCourtSection />
      <ClosingSection />
    </main>
  )
}
