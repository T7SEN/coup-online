'use client'

import { useEffect } from 'react'
import { ClosingSection } from '@/components/site/closing-section'
import { HeroSection } from '@/components/site/hero-section'
import { HowItPlaysSection } from '@/components/site/how-it-plays-section'
import { TheCourtSection } from '@/components/site/the-court-section'
import { SITE } from '@/lib/site-metadata'

// Home / landing page. A sectioned pitch — each section lives in its own file
// under components/site/ and owns its own entrance animation. This file only
// composes them in order and owns the page-scoped scroll-snap toggle. The
// scroll-to-top control is shared by every (site) page — it lives in the
// route-group layout, not here.
// SKILL.md § 1 — no guest play; the per-section play panels are session-gated.

// JSON-LD structured data — gives Google + Bing + LinkedIn machine-readable
// signals for rich-result eligibility (sitelinks, "About this result" panel,
// Knowledge Graph entries). Three schemas in one graph:
//
//   - WebSite        — name, URL, search action hint (we don't ship search
//                      yet so omit the search action — adding it later is
//                      a one-line change)
//   - Organization   — who's behind the site (T7SEN) and the site's logo
//                      (the dynamic /icon route)
//   - WebApplication — the play surface itself: free, browser-only,
//                      game/strategy category
//
// References:
//   - schema.org/WebSite
//   - schema.org/Organization
//   - schema.org/WebApplication
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      description: SITE.description,
      inLanguage: 'en',
    },
    {
      '@type': 'Organization',
      '@id': `${SITE.url}/#organization`,
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/icon`,
      founder: { '@type': 'Person', name: 'T7SEN' },
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE.url}/#app`,
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      applicationCategory: 'GameApplication',
      applicationSubCategory: 'Card game',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript and WebSockets',
      genre: ['Card game', 'Strategy', 'Multiplayer'],
      audience: { '@type': 'PeopleAudience', suggestedMinAge: 13 },
      // Free + no ads — surfaces in the "Price" line on rich results.
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      isAccessibleForFree: true,
      publisher: { '@id': `${SITE.url}/#organization` },
    },
  ],
} as const

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
      {/* JSON-LD structured data — inlined as a <script> tag so it's in
          the static HTML for crawlers that don't run JS. */}
      <script
        type="application/ld+json"
        // dangerouslySetInnerHTML is the canonical Next.js + React pattern
        // for emitting JSON-LD without React escaping the JSON.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <HeroSection />
      <HowItPlaysSection />
      <TheCourtSection />
      <ClosingSection />
    </main>
  )
}
