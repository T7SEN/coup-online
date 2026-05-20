import { headers } from 'next/headers'
import { fetchWorker } from '@/lib/worker-fetch'

// Server-side session helper for Server Components and Route Handlers.
// Forwards the browser's cookie header to Better Auth's /api/auth/get-session
// endpoint on the Worker (via the same URL the rewrites target, called
// directly to avoid an extra Vercel hop).
//
// Returns null when the visitor has no valid session (no cookie, expired, or
// revoked) — the caller is expected to redirect to /auth/signin in that case.
// `fetchWorker` handles the infrastructure-down path: if the Worker is
// unreachable or returns 5xx, it redirects to /maintenance directly, so this
// function never has to surface that failure mode.

export interface ServerSession {
  readonly user: {
    readonly id: string
    readonly name: string | null
    readonly email: string
    readonly image: string | null
  }
  readonly session: {
    readonly id: string
    readonly expiresAt: string
  }
}

export async function getServerSession(): Promise<ServerSession | null> {
  const hdrs = await headers()
  const cookie = hdrs.get('cookie') ?? ''
  if (cookie.length === 0) return null

  const res = await fetchWorker('/api/auth/get-session', {
    headers: { cookie },
    // Sessions can be revoked or expire; never cache.
    cache: 'no-store',
  })
  if (!res.ok) return null
  const json = (await res.json()) as ServerSession | null
  if (!json?.user?.id) return null
  return json
}
