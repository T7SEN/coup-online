import type { Metadata } from 'next'
import { probeWorker } from '@/lib/worker-fetch'
import { PlayHub } from './play-hub'

// The play hub — the front door to a game. Create a private table or join one
// by code; quick-match (ranked matchmaking) is **v2 scope** and rendered as
// an informational "Coming in v2" tile. The header, the cards, and their
// dealt-in entrance animation all live in the client PlayHub; this server
// page only sets metadata and the page frame.
//
// We probe the Worker before rendering because the page itself has no other
// Worker call to gate on, but every working CTA inside PlayHub leads to the
// Worker (creating a private room, joining by code). If the Worker is
// unreachable, `probeWorker` redirects to /maintenance immediately — better
// than letting the visitor click "Create a table" and watch it fail silently.

import { pageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Play',
  description:
    'Start a private 3 to 6 player Coup match or join one with a code. Free, browser-only, no install.',
  path: '/play',
})
export const dynamic = 'force-dynamic'

export default async function PlayPage() {
  await probeWorker()
  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <PlayHub />
    </main>
  )
}
