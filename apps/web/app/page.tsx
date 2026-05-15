'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient, signOut, useSession } from '@/lib/auth-client'
import { generateMatchCode, parseMatchCode } from '@/lib/match-code'

// Lobby page. SKILL.md § 1 — no guest play; redirect to /auth/signin if
// no session. SKILL.md § 5 — fetch /api/ws-token (proxied to the Worker
// via next.config.ts rewrites) to mint the WS JWT.

export default function Lobby() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [matchCode, setMatchCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchToken(): Promise<string | null> {
    setError(null)
    try {
      const res = await fetch('/api/ws-token', { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        setError(`Token request failed (${res.status}): ${text}`)
        return null
      }
      const json = (await res.json()) as { token: string }
      return json.token
    } catch (err) {
      setError(`Token request error: ${(err as Error).message}`)
      return null
    }
  }

  async function handleCreate() {
    setBusy(true)
    const token = await fetchToken()
    if (!token) {
      setBusy(false)
      return
    }
    // 6-char base32 code (lib/match-code.ts). Memorable, copy-pasteable,
    // URL-safe. Future: collision-resistant codes via RoomCodeRegistry DO
    // (references/durable-objects.md).
    const newMatchId = generateMatchCode()
    window.sessionStorage.setItem(`coup-online:token:${newMatchId}`, token)
    router.push(`/room/${encodeURIComponent(newMatchId)}`)
  }

  async function handleJoin() {
    const id = parseMatchCode(matchCode)
    if (id.length === 0) return
    setBusy(true)
    const token = await fetchToken()
    if (!token) {
      setBusy(false)
      return
    }
    window.sessionStorage.setItem(`coup-online:token:${id}`, token)
    router.push(`/room/${encodeURIComponent(id)}`)
  }

  async function handlePaste() {
    try {
      const text = await window.navigator.clipboard.readText()
      setMatchCode(parseMatchCode(text))
    } catch {
      setError('Could not read clipboard. Paste with Ctrl+V instead.')
    }
  }

  async function handleSignOut() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/auth/signin')
        },
      },
    })
  }

  if (isPending) {
    return <main className="mx-auto max-w-md p-8">Loading…</main>
  }
  if (!session?.user) {
    // The lobby is a Client Component, so we can't redirect from the server.
    // Fall back to a link; no middleware in the Better Auth migration —
    // /room/[matchId]/page.tsx (server component) is what gates app entry.
    return (
      <main className="mx-auto max-w-md p-8">
        <p>
          Please{' '}
          <a className="text-blue-600 underline" href="/auth/signin">
            sign in
          </a>{' '}
          to play.
        </p>
      </main>
    )
  }

  const displayName =
    session.user.name ?? session.user.email?.split('@')[0] ?? 'Player'
  const canJoin = !busy && parseMatchCode(matchCode).length > 0
  // Lint: authClient is imported for type-flow but only used indirectly
  // through useSession + signOut. Reference it once so the import isn't
  // flagged as unused in environments where TS pure-import detection drops
  // the side-effect.
  void authClient

  return (
    <main className="mx-auto max-w-md p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Coup Online</h1>
        <button
          onClick={() => void handleSignOut()}
          className="text-sm text-gray-600 hover:underline"
        >
          Sign out
        </button>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Signed in as{' '}
        <span dir="auto" className="font-medium text-gray-700">
          {displayName}
        </span>
        .
      </p>

      <button
        onClick={handleCreate}
        disabled={busy}
        className="mb-4 w-full rounded bg-blue-600 p-2 text-white disabled:bg-gray-300"
      >
        Create new match
      </button>

      <div className="my-4 text-center text-sm text-gray-400">or</div>

      <label className="mb-2 block">
        <span className="block text-sm font-medium">Match code</span>
        <div className="mt-1 flex gap-2">
          <input
            dir="auto"
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value)}
            onPaste={(e) => {
              // Intercept paste to normalize URLs into the bare code. Lets
              // users paste either a bare code or a full /room/<code> URL.
              e.preventDefault()
              const text = e.clipboardData.getData('text')
              setMatchCode(parseMatchCode(text))
            }}
            placeholder="paste code or link"
            className="block w-full rounded border border-gray-300 p-2 uppercase"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="rounded bg-gray-200 px-3 text-sm hover:bg-gray-300"
          >
            Paste
          </button>
        </div>
      </label>

      <button
        onClick={handleJoin}
        disabled={!canJoin}
        className="w-full rounded bg-green-600 p-2 text-white disabled:bg-gray-300"
      >
        Join match
      </button>

      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </main>
  )
}
