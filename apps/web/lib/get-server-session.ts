import { headers } from 'next/headers'

// Server-side session helper for Server Components and Route Handlers.
// Forwards the browser's cookie header to Better Auth's /api/auth/get-session
// endpoint on the Worker (via the same URL the rewrites target, called
// directly to avoid an extra Vercel hop).
//
// Returns null on any failure — caller redirects to /auth/signin.

const TARGET =
  process.env.NEXT_PUBLIC_GAME_SERVER_HTTP ?? 'http://127.0.0.1:8787'

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

  try {
    const res = await fetch(`${TARGET}/api/auth/get-session`, {
      headers: { cookie },
      // Sessions can be revoked or expire; never cache.
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as ServerSession | null
    if (!json?.user?.id) return null
    return json
  } catch {
    return null
  }
}
