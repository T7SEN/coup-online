'use client'

import { useState } from 'react'
import { Fingerprint, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'

// Passkeys / WebAuthn card in /settings. Backed by Better Auth's
// `@better-auth/passkey` plugin (wired in apps/game-server/src/auth.ts).
//
// Sign-in flow: the user enrols a credential here (Touch ID, Face ID,
// Windows Hello, a YubiKey, …), then on the sign-in page they tap "Sign in
// with a passkey" which triggers the WebAuthn authentication ceremony. A
// successful ceremony produces a full session and skips 2FA — that's
// correct because WebAuthn is itself multi-factor (possession + biometric/
// PIN).
//
// `initialCount` is the server's count at page render time so the card
// paints the right empty/populated state on first frame; once mounted the
// reactive `useListPasskeys()` hook (a nanostores atom in the passkey
// plugin) takes over for live updates after add/delete.

interface PasskeyRow {
  id: string
  name?: string | undefined
  createdAt: Date
}

function isoDate(d: Date | string | number): string {
  const ms = typeof d === 'number' ? d : new Date(d).getTime()
  if (!Number.isFinite(ms)) return '—'
  return new Date(ms).toISOString().slice(0, 10)
}

export function PasskeysCard({ initialCount }: { initialCount: number }) {
  // The reactive list — populated by Better Auth's atomListeners after
  // every add/delete/sign-out, so we don't need to refetch manually.
  const listed = authClient.useListPasskeys() as {
    data: PasskeyRow[] | null
    isPending: boolean
  }
  const passkeys = listed.data ?? []
  // While the first fetch is in flight we lean on the server count — the
  // card shouldn't flash an empty state at users who actually have keys.
  const showInitialEmpty = listed.data === null && initialCount === 0

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function add() {
    setBusy(true)
    try {
      const res = await authClient.passkey.addPasskey({
        name: name.trim() || undefined,
      })
      if (res?.error) {
        throw new Error(res.error.message ?? 'Could not add passkey.')
      }
      setName('')
      toast.success('Passkey added.')
    } catch (err) {
      // The browser cancels the ceremony as a DOMException when the user
      // dismisses the system prompt; surface a softer message in that case.
      const message =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Passkey setup was cancelled.'
            : err.message
          : 'Could not add passkey.'
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setDeletingId(id)
    try {
      const res = await authClient.passkey.deletePasskey({ id })
      if (res?.error) {
        throw new Error(res.error.message ?? 'Could not remove passkey.')
      }
      toast.success('Passkey removed.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not remove passkey.'
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-wide">
            Passkeys
            <Fingerprint className="size-4 text-gold" aria-hidden />
          </h2>
          <p className="text-sm text-muted-foreground">
            Sign in with Touch ID, Face ID, Windows Hello, or a security
            key. Phishing-resistant by design — signing in with a passkey
            skips the 2FA challenge.
          </p>
        </div>

        {showInitialEmpty || passkeys.length === 0 ? (
          // No keys yet. Pitch + the add form.
          <p className="rounded-md border border-dashed border-gold/30 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
            No passkeys enrolled yet. Add one to enable passwordless sign-in
            on this device.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {passkeys.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span dir="auto" className="truncate text-sm font-medium">
                    {p.name?.trim() || 'Unnamed passkey'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Added {isoDate(p.createdAt)}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(p.id)}
                  disabled={deletingId === p.id}
                  aria-label={`Remove passkey ${p.name ?? p.id}`}
                  className="text-destructive hover:text-destructive"
                >
                  {deletingId === p.id ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Add form — sits below the list so it doesn't push existing keys
            around when it expands. Name is optional but recommended; we
            pass undefined when blank so the plugin falls back to its own
            default label. */}
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Label htmlFor="passkey-name" className="text-sm">
            Add a passkey
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="passkey-name"
              dir="auto"
              type="text"
              placeholder="e.g. iPhone, YubiKey"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
              className="min-w-0 flex-1"
              disabled={busy}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void add()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Fingerprint className="mr-1.5 size-3.5" aria-hidden />
              )}
              Add passkey
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your browser will ask you to confirm with Touch ID, Face ID,
            Windows Hello, or your security key.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
