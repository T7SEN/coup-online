'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/logo'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { signOut, useSession } from '@/lib/auth-client'
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
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6">
        <Logo size="lg" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    )
  }

  if (!session?.user) {
    // The lobby is a Client Component, so we can't redirect from the server.
    // Fall back to a link; no middleware in the Better Auth migration —
    // /room/[matchId]/page.tsx (server component) is what gates app entry.
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <Logo size="lg" />
        <div className="h-px w-24 bg-gold/60" />
        <p className="text-sm text-muted-foreground">
          Sign in to create or join a match.
        </p>
        <Button asChild size="lg">
          <a href="/auth/signin">Sign in to play</a>
        </Button>
      </main>
    )
  }

  // `||` (not `??`) so empty-string `name` (common for magic-link signups
  // where the provider doesn't carry a display name) falls through to the
  // email prefix instead of rendering blank. trim() catches whitespace-only.
  const displayName =
    session.user.name?.trim() ||
    session.user.email?.split('@')[0]?.trim() ||
    'Player'
  const canJoin = !busy && parseMatchCode(matchCode).length > 0

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <Logo size="lg" />
        <div className="h-px w-24 bg-gold/60" />
        <p className="text-sm text-muted-foreground">
          A game of deception and nerve — 3 to 6 players.
        </p>
      </header>

      <div className="flex items-center justify-between rounded-lg border bg-card/70 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar className="size-7">
            <AvatarImage src={session.user.image ?? undefined} alt="" />
            <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="truncate text-muted-foreground">
            Signed in as{' '}
            <span dir="auto" className="font-medium text-foreground">
              {displayName}
            </span>
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Button
            size="lg"
            className="w-full"
            onClick={() => void handleCreate()}
            disabled={busy}
          >
            Create new match
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs tracking-widest text-muted-foreground uppercase">
              or
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="match-code">Match code</Label>
            <div className="flex gap-2">
              <Input
                id="match-code"
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
                className="uppercase"
              />
              <Button type="button" variant="outline" onClick={() => void handlePaste()}>
                Paste
              </Button>
            </div>
            <Button
              variant="success"
              size="lg"
              className="w-full"
              onClick={() => void handleJoin()}
              disabled={!canJoin}
            >
              Join match
            </Button>
          </div>
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
