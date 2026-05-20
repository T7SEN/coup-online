import type { Metadata } from 'next'
import { SupportContent } from './support-content'

// Support page — the informational landing for the (planned) patronage
// programme. Coup Online runs on free-tier infrastructure (SKILL.md § 2), so
// there is no paid backend yet: this page sets out the privileges to come and
// points at the one thing anyone can do today — play. The design + entrance
// animation live in the client SupportContent.

export const metadata: Metadata = { title: 'Support — Coup Online' }

export default function SupportPage() {
  return (
    // flex-1 + justify-center so the (compact) content sits centred within a
    // single viewport — no scrolling. pt clears the fixed navbar.
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 pt-20 pb-6 sm:px-6 sm:pt-24">
      <SupportContent />
    </main>
  )
}
