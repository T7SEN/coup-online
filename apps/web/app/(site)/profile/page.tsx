import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GAME_SERVER_HTTP } from '@/lib/config'

// Bare `/profile` — a convenience entry point. The real profile lives at
// `/profile/[userId]` (one page, editable for its owner). This resolves the
// signed-in viewer and forwards them to their own profile; signed-out
// visitors go to sign-in. `headers()` already forces dynamic rendering.

export const dynamic = 'force-dynamic'

export default async function ProfileRedirect() {
  const cookie = (await headers()).get('cookie') ?? ''

  // Resolve the viewer's id from the Worker. NOTE: `redirect()` works by
  // throwing, so it must run OUTSIDE the try/catch — a catch here would
  // swallow the redirect.
  let userId: string | null = null
  if (cookie.length > 0) {
    try {
      const res = await fetch(`${GAME_SERVER_HTTP}/api/me/profile`, {
        headers: { cookie },
        cache: 'no-store',
      })
      if (res.ok) {
        const json = (await res.json()) as { user: { userId: string } }
        userId = json.user.userId
      }
    } catch {
      userId = null
    }
  }

  if (userId) redirect(`/profile/${userId}`)
  redirect('/auth/signin')
}
