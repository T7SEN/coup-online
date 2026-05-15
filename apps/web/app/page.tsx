'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_SERVER_HTTP } from '@/lib/config'
import { getOrCreateUserId } from '@/lib/identity'
import { generateMatchCode, parseMatchCode } from '@/lib/match-code'

export default function Lobby() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [matchCode, setMatchCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // userId is read inside click handlers (browser-only by definition), so no
  // useEffect / setState dance is needed. SKILL.md § 5 hydration safety —
  // browser-only access deferred to handler invocation.

  async function fetchToken(userId: string): Promise<string | null> {
    setError(null)
    try {
      const res = await fetch(`${GAME_SERVER_HTTP}/api/dev-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, displayName: displayName.trim() }),
      })
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
    if (!displayName.trim()) return
    setBusy(true)
    const userId = getOrCreateUserId()
    const token = await fetchToken(userId)
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
    if (!displayName.trim() || id.length === 0) return
    setBusy(true)
    const userId = getOrCreateUserId()
    const token = await fetchToken(userId)
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
      // Clipboard API may be unavailable (HTTP context, denied permission,
      // older browser). The user can still paste manually with Ctrl+V — the
      // onPaste handler below normalizes that too.
      setError('Could not read clipboard. Paste with Ctrl+V instead.')
    }
  }

  const canCreate = !busy && displayName.trim().length > 0
  const canJoin =
    !busy && displayName.trim().length > 0 && parseMatchCode(matchCode).length > 0

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-3xl font-semibold">Coup Online</h1>
      <p className="mb-6 text-sm text-gray-500">
        Open three browser tabs to test a 3-player match. Each tab needs a
        distinct display name and joins the same match code.
      </p>

      <label className="mb-4 block">
        <span className="block text-sm font-medium">Display name</span>
        <input
          dir="auto"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          placeholder="e.g., Alice"
          className="mt-1 block w-full rounded border border-gray-300 p-2"
        />
      </label>

      <button
        onClick={handleCreate}
        disabled={!canCreate}
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
              // Intercept paste to normalize URLs into the bare code before
              // the input applies the raw paste. Lets users paste either a
              // bare code or a full /room/<code> URL.
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
