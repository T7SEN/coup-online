'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { authClient } from '@/lib/auth-client'

// 2FA challenge form rendered during a sign-in flow when the user has 2FA
// enrolled. Better Auth's twoFactor client plugin (configured with
// `twoFactorPage: '/auth/two-factor'` in auth-client.ts) navigates here
// after the OAuth/magic-link step succeeds but before the full session is
// granted. The user proves the second factor to finish signing in.
//
// Three challenge methods are wired (server side: apps/game-server/src/auth.ts):
//   1. Authenticator app (TOTP) — primary, strongest, no email round-trip.
//   2. Email code (OTP) — 6-digit code emailed via Resend; fallback when
//      the user's authenticator is on a device they can't reach.
//   3. Backup code — one-time recovery codes the user saved at enrolment.
//
// On verify success Better Auth swaps the partial cookie for the full
// session cookie and we hard-navigate to the `next` URL the server shell
// passed in (defaults to the homepage) so every Server Component on the
// next page picks up the new session cleanly.

type Mode = 'totp' | 'email' | 'backup'

export function TwoFactorChallenge({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('totp')
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [busy, setBusy] = useState(false)
  // Email mode is two-step: send a code, then verify it. `emailSent` tracks
  // which sub-state we're in. Reset whenever the user switches modes or
  // re-requests a code so the UI never sticks in "sent" with a stale code.
  const [emailSent, setEmailSent] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setCode('')
    setEmailSent(false)
  }

  async function sendEmailCode() {
    setSendingEmail(true)
    try {
      const res = await authClient.twoFactor.sendOtp()
      if (res.error) throw new Error(res.error.message ?? 'Could not send code.')
      setEmailSent(true)
      setCode('')
      toast.success('Code sent. Check your inbox.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not send code.'
      toast.error(message)
    } finally {
      setSendingEmail(false)
    }
  }

  async function submit() {
    // Email mode: if the code hasn't been sent yet, the submit button is
    // wired to send instead of verify. Guard here too so an over-eager
    // Enter key press doesn't crash through with an empty code.
    if (mode === 'email' && !emailSent) {
      await sendEmailCode()
      return
    }
    const cleaned =
      mode === 'backup'
        ? code.trim()
        : code.replace(/\D/g, '').slice(0, 6)
    if ((mode === 'totp' || mode === 'email') && cleaned.length !== 6) {
      toast.error('Enter the 6-digit code.')
      return
    }
    if (mode === 'backup' && cleaned.length < 6) {
      toast.error('Enter a backup code.')
      return
    }
    setBusy(true)
    try {
      const res =
        mode === 'totp'
          ? await authClient.twoFactor.verifyTotp({
              code: cleaned,
              trustDevice,
            })
          : mode === 'email'
            ? await authClient.twoFactor.verifyOtp({
                code: cleaned,
                trustDevice,
              })
            : await authClient.twoFactor.verifyBackupCode({
                code: cleaned,
                trustDevice,
              })
      if (res.error) throw new Error(res.error.message ?? 'verify failed')
      // Hard navigate so the new session cookie is picked up cleanly by
      // every Server Component on the next page.
      window.location.href = next
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'That code did not match.'
      toast.error(message)
      setBusy(false)
    }
  }

  // Disable the verify button when the input is too short for the active
  // mode. Email mode pre-send is allowed (the button reads "Send code").
  const verifyDisabled =
    busy ||
    (mode === 'totp' && code.length < 6) ||
    (mode === 'email' && emailSent && code.length < 6) ||
    (mode === 'backup' && code.length < 5)

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pt-20 pb-12">
      <Card>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <ShieldCheck className="size-7 text-gold" aria-hidden />
            <h1 className="font-display text-xl tracking-wide">
              Two-factor verification
            </h1>
            <p className="max-w-xs text-sm text-muted-foreground">
              {mode === 'totp'
                ? 'Enter the 6-digit code from your authenticator app to finish signing in.'
                : mode === 'email'
                  ? emailSent
                    ? 'Enter the 6-digit code we just emailed you.'
                    : 'We can email a 6-digit code to the address on your account.'
                  : 'Enter one of the backup codes you saved when you set up 2FA.'}
            </p>
          </div>

          {/* Method picker — 3-way segmented control. The user can switch
              freely between methods; each switch clears the code field and
              resets email-mode back to the "send" sub-state. */}
          <div
            role="tablist"
            aria-label="Verification method"
            className="grid grid-cols-3 gap-1 rounded-md border border-border bg-card/40 p-1 text-xs"
          >
            {(
              [
                { key: 'totp', label: 'Authenticator' },
                { key: 'email', label: 'Email' },
                { key: 'backup', label: 'Backup' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                role="tab"
                type="button"
                aria-selected={mode === opt.key}
                onClick={() => switchMode(opt.key)}
                className={cn(
                  'cursor-pointer rounded-sm px-2 py-1.5 font-medium transition-colors',
                  mode === opt.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'email' && !emailSent ? (
            // Email mode, "send" sub-state — the Verify button below becomes
            // "Send code" so we don't render the input until there's a code
            // to enter. Keeps the form from looking half-filled before the
            // first round-trip.
            <p className="flex items-center gap-2 rounded-md border border-dashed border-gold/30 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
              <Mail className="size-4 shrink-0 text-gold" aria-hidden />
              We&rsquo;ll send the code to the email on your account.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="totp-code">
                {mode === 'backup' ? 'Backup code' : 'Verification code'}
              </Label>
              <Input
                id="totp-code"
                type="text"
                inputMode={mode === 'backup' ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                maxLength={mode === 'backup' ? 32 : 6}
                value={code}
                onChange={(e) =>
                  setCode(
                    mode === 'backup'
                      ? e.target.value
                      : e.target.value.replace(/\D/g, '').slice(0, 6),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
                placeholder={mode === 'backup' ? 'XXXXX-XXXXX' : '000000'}
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
              {mode === 'email' && emailSent ? (
                // "Send again" link — subject to the server's 3/min rate
                // limit so a real user retrying twice still works while
                // abuse loops get rejected.
                <button
                  type="button"
                  onClick={() => void sendEmailCode()}
                  disabled={sendingEmail}
                  className="self-start cursor-pointer text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingEmail ? 'Sending…' : 'Send a new code'}
                </button>
              ) : null}
            </div>
          )}

          {/* Trust-this-device opt-in — when checked, Better Auth sets a
              30-day "trusted device" cookie that skips 2FA on this device.
              Applies to whichever method succeeds. */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="size-4 cursor-pointer"
            />
            Trust this device for 30 days
          </label>

          <Button
            type="button"
            size="lg"
            onClick={() => void submit()}
            disabled={
              mode === 'email' && !emailSent ? sendingEmail : verifyDisabled
            }
          >
            {(busy || sendingEmail) ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : null}
            {mode === 'email' && !emailSent ? 'Send code' : 'Verify'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            <Link
              href="/auth/signin"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Cancel and sign out
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
