'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { signOut } from '@/lib/auth-client'

// The interactive parts of the settings page — sign out and delete account.
// The settings page itself is a Server Component; this is its client island.

// Sign out on this device, then return home.
export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      onClick={() =>
        void signOut({ fetchOptions: { onSuccess: () => router.push('/') } })
      }
    >
      Sign out
    </Button>
  )
}

// Delete-account danger zone. The Worker anonymizes the account and clears
// every session server-side (DELETE /api/me/account); the dialog requires
// typing DELETE to confirm, then we drop the cookie and leave.
const CONFIRM_WORD = 'DELETE'

export function DeleteAccountCard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (busy) return
    setOpen(next)
    setConfirm('')
    setError(null)
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/me/account', { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      // The account is anonymized and its sessions are gone server-side;
      // clear the cookie (best-effort) and leave.
      await signOut().catch(() => {})
      router.push('/')
    } catch {
      setError('Could not delete your account. Please try again.')
      setBusy(false)
    }
  }

  return (
    <Card className="border border-destructive/40">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg tracking-wide text-destructive">
            Delete account
          </h2>
          <p className="text-sm text-muted-foreground">
            Permanently erases your name, email and avatar, and signs you out
            everywhere. Past matches stay on record as &ldquo;Deleted
            player&rdquo;. This cannot be undone.
          </p>
        </div>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="self-start">
              Delete account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently erases your profile and signs you out — it
                cannot be undone. Type {CONFIRM_WORD} below to confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
                disabled={busy}
                aria-label={`Type ${CONFIRM_WORD} to confirm`}
              />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={busy}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={busy || confirm.trim() !== CONFIRM_WORD}
                onClick={() => void handleDelete()}
              >
                {busy ? 'Deleting…' : 'Delete account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
