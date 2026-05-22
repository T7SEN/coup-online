import type { Metadata } from 'next'
import { AboutContent } from './about-content'

// About page — what Coup Online is, who built it, and credit to the game it
// adapts. Static Server Component; the content + entrance animation live in
// the client AboutContent.

import { pageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description:
    'A real-time, fan-made web adaptation of Coup — built and paid for by a single student, for the love of it. Free for all, no ads, server-authoritative.',
  path: '/about',
})

export default function AboutPage() {
  return (
    // flex-1 + justify-center so the (compact) content sits centred within a
    // single viewport — no scrolling. pt clears the fixed navbar.
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pt-20 pb-6 sm:px-6 sm:pt-24">
      <AboutContent />
    </main>
  )
}
