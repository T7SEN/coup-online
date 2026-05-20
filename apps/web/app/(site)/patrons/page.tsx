import type { Metadata } from 'next'
import { HallContent } from './hall-content'

// Hall of Patrons — referenced by privilege #3 in /support ("Name in the Hall
// of Patrons"). Static today: the supporter programme has not yet opened, so
// the page renders the empty Hall (ten vacant Founding-patron slots) plus a
// CTA back to /support. Once the supporter system is built, swap the empty
// PATRONS list for a real data fetch.

export const metadata: Metadata = { title: 'Hall of Patrons — Coup Online' }

export default function PatronsPage() {
  return (
    // flex-1 + justify-center so the (compact) content sits centred within a
    // single viewport — no scrolling. pt clears the fixed navbar.
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pt-20 pb-6 sm:px-6 sm:pt-24">
      <HallContent />
    </main>
  )
}
