import type { Metadata } from 'next'
import { probeWorker } from '@/lib/worker-fetch'
import { PlayHub } from './play-hub'

// The play hub — the front door to a game. Create a private table or join one
// by code; quick-match (ranked matchmaking) is scaffolded but not yet live.
// The header, the cards, and their dealt-in entrance animation all live in the
// client PlayHub; this server page only sets metadata and the page frame.
//
// We probe the Worker before rendering because the page itself has no other
// Worker call to gate on, but every CTA inside PlayHub leads to the Worker
// (creating a room, joining by code, ranked matchmaking). If the Worker is
// unreachable, `probeWorker` redirects to /maintenance immediately — better
// than letting the visitor click "Create a table" and watch it fail silently.

export const metadata: Metadata = { title: 'Play — Coup Online' }
export const dynamic = 'force-dynamic'

export default async function PlayPage() {
  await probeWorker()
  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <PlayHub />
    </main>
  )
}
