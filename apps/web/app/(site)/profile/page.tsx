import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { fetchWorker } from '@/lib/worker-fetch'

// Bare `/profile` — a convenience entry point. The real profile lives at
// `/profile/[userId]` (one page, editable for its owner). This resolves the
// signed-in viewer and forwards them to their own profile; signed-out
// visitors go to sign-in. `headers()` already forces dynamic rendering.
// `fetchWorker` redirects to /maintenance if the Worker is unreachable, so
// the only outcomes here are: own-profile redirect, signin redirect, or
// /maintenance redirect (handled inside fetchWorker).

export const dynamic = 'force-dynamic'

export default async function ProfileRedirect() {
  const cookie = (await headers()).get('cookie') ?? ''

  let userId: string | null = null
  if (cookie.length > 0) {
    const res = await fetchWorker('/api/me/profile', {
      headers: { cookie },
      cache: 'no-store',
    })
    if (res.ok) {
      const json = (await res.json()) as { user: { userId: string } }
      userId = json.user.userId
    }
  }

  if (userId) redirect(`/profile/${userId}`)
  redirect('/auth/signin')
}
