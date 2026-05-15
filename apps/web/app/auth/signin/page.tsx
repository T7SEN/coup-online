'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

// Sign-in UI. SKILL.md § 5 / § 6 — three providers (Google, Discord, magic
// link). The Better Auth client kicks the appropriate flow:
//   - signIn.social: redirects to the provider, comes back to the OAuth
//     callback at /api/auth/callback/<provider> (proxied to the Worker).
//   - signIn.magicLink: emails the link via Resend; the user clicks and
//     lands on the home page authenticated.
//
// SKILL.md § 1 — no guest play. Without a session, the lobby and /room/*
// server-side checks redirect back here.

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSocial(provider: 'google' | 'discord') {
    setBusy(true)
    setError(null)
    const { error: err } = await authClient.signIn.social({
      provider,
      callbackURL: '/',
    })
    if (err) {
      setError(err.message ?? 'Sign-in failed')
      setBusy(false)
    }
    // On success the page redirects; no need to setBusy(false).
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (email.length === 0) return
    setBusy(true)
    setError(null)
    const { error: err } = await authClient.signIn.magicLink({
      email,
      callbackURL: '/',
    })
    setBusy(false)
    if (err) {
      setError(err.message ?? 'Could not send magic link')
      return
    }
    setSent(true)
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-4 text-3xl font-semibold">Sign in to Coup Online</h1>
      <p className="mb-6 text-sm text-gray-500">
        Sign in to play. We store only your provider name, email, avatar, and
        your match history.
      </p>

      <button
        type="button"
        onClick={() => void handleSocial('google')}
        disabled={busy}
        className="mb-3 w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
      >
        Continue with Google
      </button>

      <button
        type="button"
        onClick={() => void handleSocial('discord')}
        disabled={busy}
        className="mb-6 w-full rounded bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:bg-gray-300"
      >
        Continue with Discord
      </button>

      <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" /> or by email{' '}
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      {sent ? (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Check your inbox for a sign-in link. It expires in a few minutes and
          only works once.
        </p>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-2">
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded border border-gray-300 p-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-green-600 p-2 text-white hover:bg-green-700 disabled:bg-gray-300"
          >
            Send magic link
          </button>
        </form>
      )}

      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </main>
  )
}
