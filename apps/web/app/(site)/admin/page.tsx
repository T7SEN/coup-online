import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isAdminEmail } from '@coup-online/protocol'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { getServerSession } from '@/lib/get-server-session'
import { fetchWorker } from '@/lib/worker-fetch'
import { AdminConsole } from './admin-content'

// /admin — gated to the single admin account (see packages/protocol/admin.ts).
// Server Component: looks up the session, compares the email to the
// allow-list, and renders `notFound()` for everyone else. We use 404 rather
// than 401/403 so the existence of /admin stays private.
//
// The Worker mirrors the same gate at the API layer (`checkAdmin` in
// game-server/src/index.ts), so even a direct HTTP call to /api/admin/* is
// denied to non-admins — defense in depth.

import { pageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Admin',
  noindex: true,
})
export const dynamic = 'force-dynamic'

interface AdminStats {
  totalUsers: number
  activePatrons: number
  founderSlotsUsed: number
}

async function fetchStats(cookie: string): Promise<AdminStats | null> {
  const res = await fetchWorker('/api/admin/stats', {
    headers: { cookie },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as AdminStats
}

export default async function AdminPage() {
  const session = await getServerSession()
  // No session → 404 (same shape as wrong-email). Wrong email → 404. The
  // common case (signed in but not admin) and the uncommon case (probing the
  // URL signed-out) are indistinguishable to the visitor.
  if (!session) notFound()
  if (!isAdminEmail(session.user.email)) notFound()

  // Server-side initial stats — saves a round-trip on first render. Failure
  // here doesn't notFound() the page; the console still works, it just shows
  // zeros until the client refreshes.
  const cookie = (await headers()).get('cookie') ?? ''
  const stats = await fetchStats(cookie)

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24">
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Court steward
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Admin
        </h1>
        <OrnamentDivider className="w-44 max-w-[70vw] text-gold/60" />
        <p className="max-w-xl text-pretty text-sm text-muted-foreground">
          Tools the maintainer uses to keep the court in order. Hidden from
          everyone else — visiting this URL signed out, or as any other user,
          returns 404.
        </p>
      </header>

      <div className="mt-10">
        <AdminConsole initialStats={stats} />
      </div>
    </main>
  )
}
