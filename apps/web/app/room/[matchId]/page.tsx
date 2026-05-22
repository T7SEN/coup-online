import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/get-server-session'
import { pageMetadata } from '@/lib/site-metadata'
import { RoomClient } from './client'

// Ephemeral live game state — never indexable.
export const metadata: Metadata = pageMetadata({
  title: 'Game room',
  noindex: true,
})

// Server Component — reads the matchId param (async in Next 16), enforces
// the auth gate, and hands off to the Client Component that owns the
// WebSocket. SKILL.md § 1 — no guest play.
//
// `getServerSession()` forwards the browser's cookie header to Better Auth's
// /api/auth/get-session on the Worker. Without middleware (per the Better
// Auth migration), this is the canonical server-side gate.
export default async function RoomPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  const session = await getServerSession()
  if (!session) {
    redirect('/auth/signin')
  }
  return <RoomClient matchId={matchId} myPlayerId={session.user.id} />
}
