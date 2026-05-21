import type { Metadata } from 'next'
import { fetchWorker } from '@/lib/worker-fetch'
import { HallContent } from './hall-content'

// Hall of Patrons — referenced by privilege #3 in /support ("Name in the Hall
// of Patrons"). Real data: pulls /api/patrons (the founder slots that have
// been filled, in ascending rank order) and passes them through to the
// client island. The Hall renders one slot per Roman numeral I–X; filled
// slots show the patron's name (and any vanity slug → /u/<slug>), unfilled
// ones say "vacant". Server-rendered so it works pre-hydration.

export const metadata: Metadata = { title: 'Hall of Patrons — Coup Online' }
export const dynamic = 'force-dynamic'

interface PatronEntry {
  userId: string
  founderRank: number
  displayName: string
  image: string | null
  slug: string | null
  patronSince: number | null
}

async function fetchPatrons(): Promise<PatronEntry[]> {
  // Network / 5xx → fetchWorker redirects to /maintenance. An OK-but-empty
  // response just means no founders have been granted yet — the Hall renders
  // ten vacant slots, which is the correct empty state.
  const res = await fetchWorker('/api/patrons', { cache: 'no-store' })
  if (!res.ok) return []
  const json = (await res.json()) as { patrons: PatronEntry[] }
  return json.patrons
}

export default async function PatronsPage() {
  const patrons = await fetchPatrons()
  return (
    // flex-1 + justify-center so the (compact) content sits centred within a
    // single viewport — no scrolling. pt clears the fixed navbar.
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pt-20 pb-6 sm:px-6 sm:pt-24">
      <HallContent patrons={patrons} />
    </main>
  )
}
