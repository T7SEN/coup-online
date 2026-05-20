'use client'

import { useEffect } from 'react'
import { Logo } from '@/components/logo'

// OAuth popup landing route. The social sign-in flow (app/auth/signin/page.tsx)
// runs the Google / Discord hand-off inside a popup window with this route as
// its callbackURL (and errorCallbackURL). Better Auth sets the session cookie
// on the shared origin, then redirects the popup here — this page tells the
// tab that opened it and closes itself. references/auth.md.
//
// Reached as a normal tab (no opener — a stale or shared link)? window.close()
// is then a silent no-op, so we fall back to the lobby.
export default function AuthCallbackPage() {
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('coup-auth')
      channel.postMessage('popup-done')
      channel.close()
    } catch {
      // No BroadcastChannel — the opener also polls window.closed, so the
      // close() below is enough to unblock it.
    }
    window.close()
    const fallback = window.setTimeout(() => window.location.replace('/'), 200)
    return () => window.clearTimeout(fallback)
  }, [])

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size="lg" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </main>
  )
}
