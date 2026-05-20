import type { Metadata } from 'next'
import { PlayHub } from './play-hub'

// The play hub — the front door to a game. Create a private table or join one
// by code; quick-match (ranked matchmaking) is scaffolded but not yet live.
// The header, the cards, and their dealt-in entrance animation all live in the
// client PlayHub; this server page only sets metadata and the page frame.

export const metadata: Metadata = { title: 'Play — Coup Online' }

export default function PlayPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <PlayHub />
    </main>
  )
}
