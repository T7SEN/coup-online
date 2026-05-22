import type { Metadata } from 'next'
import { MaintenanceContent } from './maintenance-content'

// /maintenance — the friendly fallback shown when the game server is
// unreachable. The page is deliberately static: it makes NO calls to /api,
// so it renders fine even when the Worker is down. The Worker (or a future
// client-side guard on /play) can redirect here when it cannot serve.
//
// Server Component shell; the actual content + GSAP entrance + ambient
// hourglass live in the client island below.

import { pageMetadata } from '@/lib/site-metadata'

// Status page — don't want this returned for normal search queries.
export const metadata: Metadata = pageMetadata({
  title: 'In recess',
  noindex: true,
})

export default function MaintenancePage() {
  return (
    // flex-1 + justify-center so the compact content sits centred within a
    // single viewport — no scrolling. pt clears the fixed navbar.
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pt-20 pb-12 sm:px-6 sm:pt-24">
      <MaintenanceContent />
    </main>
  )
}
