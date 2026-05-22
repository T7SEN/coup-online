'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Fingerprint, MailCheck } from 'lucide-react'
import { Logo } from '@/components/logo'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'

// Sign-in UI. SKILL.md § 5 / § 6 — three providers (Google, Discord, magic
// link). references/auth.md documents the full flow.
//
// Normally opened in a popup window by useSignInPopup() (lib/use-sign-in.ts)
// from the navbar / lobby — the whole flow runs in that popup so the opener
// page is never navigated away. Also works as a plain page (sign-out landing,
// deep links).
//
//   - signIn.social (Google / Discord): redirects THIS window to the provider.
//     Better Auth returns it to /auth/callback on success — which closes the
//     popup so the opener can refetch its session — or back here with ?error=
//     on failure.
//   - signIn.magicLink: emails the link via Resend; the user clicks it from
//     their inbox and lands on /auth/callback authenticated.
//
// SKILL.md § 1 — no guest play. Without a session, the lobby and /room/*
// server-side checks redirect back here.

function SignInForm() {
  // useSearchParams needs the <Suspense> boundary in SignInPage (SKILL.md § 5).
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  // A failed OAuth hand-off bounces back here via errorCallbackURL with
  // ?error=; seed the message from it, then let the handlers own the state.
  const [error, setError] = useState<string | null>(() =>
    searchParams.has('error')
      ? 'Sign-in didn’t finish. Please try again.'
      : null,
  )
  const [sent, setSent] = useState(false)

  // Self-close on auth completion elsewhere. Two scenarios this catches:
  //
  //   1. Magic-link path: this popup shows "Check your inbox", user clicks
  //      the link in their email (opens in a NEW tab — NOT this popup),
  //      that new tab runs the OAuth callback → 2FA → /auth/callback,
  //      /auth/callback broadcasts 'popup-done'. Without this listener the
  //      popup is orphaned at the "Check your inbox" view forever.
  //
  //   2. Any case where the main window's useSignInPopup listener doesn't
  //      fire (main window closed, navigated away, or refreshed since the
  //      popup opened — popupRef would be cleared in those cases).
  //
  // `window.close()` is a no-op when the page wasn't opened by script
  // (e.g., the user navigated to /auth/signin directly in a normal tab),
  // so the listener is safe to mount unconditionally.
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('coup-auth')
      channel.onmessage = (e: MessageEvent) => {
        if (e.data === 'popup-done') {
          window.close()
        }
      }
    } catch {
      // No BroadcastChannel — fall back to the existing
      // useSignInPopup-side close. Worst case: popup stays open and the
      // user closes it manually.
    }
    return () => channel?.close()
  }, [])

  async function handleSocial(provider: 'google' | 'discord') {
    setError(null)
    setBusy(true)
    // No disableRedirect: Better Auth navigates this window to the provider,
    // then back to callbackURL (success) or errorCallbackURL (failure).
    const { error: err } = await authClient.signIn.social({
      provider,
      callbackURL: '/auth/callback',
      errorCallbackURL: '/auth/signin',
    })
    // Only reached if the hand-off couldn't start — otherwise this window has
    // already navigated to the provider.
    if (err) {
      setBusy(false)
      setError(err.message ?? 'Could not start sign-in. Please try again.')
    }
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (email.length === 0) return
    setBusy(true)
    setError(null)
    const { error: err } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/auth/callback',
    })
    setBusy(false)
    if (err) {
      setError(err.message ?? 'Could not send magic link')
      return
    }
    setSent(true)
  }

  // Passkey (WebAuthn) sign-in — the user-agent prompts for any
  // credential registered against this rpID. Successful ceremony writes
  // a full session; 2FA is bypassed (passkeys ARE multi-factor:
  // possession + biometric/PIN). Falls back gracefully when the browser
  // has no matching credential — the toast shows the plugin's error
  // message rather than a stuck spinner.
  async function handlePasskey() {
    setError(null)
    setBusy(true)
    const res = await authClient.signIn.passkey()
    if (res?.error) {
      setBusy(false)
      const message = res.error.message ?? 'Could not sign in with passkey.'
      setError(message)
      return
    }
    // On success the Better Auth client has already set the session
    // cookie. Hard-navigate to the callback page so every Server
    // Component reads it fresh.
    window.location.href = '/auth/callback'
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <Logo size="lg" />
        <div className="h-px w-24 bg-gold/60" />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg tracking-wide">Sign in</CardTitle>
          <CardDescription>
            Sign in to play. We store only your provider name, email, avatar,
            and your match history.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void handleSocial('google')}
            disabled={busy}
          >
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void handleSocial('discord')}
            disabled={busy}
          >
            Continue with Discord
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void handlePasskey()}
            disabled={busy}
          >
            <Fingerprint className="mr-1.5 size-4" aria-hidden />
            Sign in with a passkey
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs tracking-widest text-muted-foreground uppercase">
              or by email
            </span>
            <Separator className="flex-1" />
          </div>

          {sent ? (
            <Alert>
              <MailCheck />
              <AlertTitle>Check your inbox</AlertTitle>
              <AlertDescription>
                We sent a sign-in link to your email. It expires in a few
                minutes and only works once.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleMagicLink} className="flex flex-col gap-2">
              <Label htmlFor="email" className="sr-only">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" size="lg" disabled={busy}>
                Send magic link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </main>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  )
}
