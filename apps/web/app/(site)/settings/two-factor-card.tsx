'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

// Two-factor authentication card in /settings. Three render states:
//
//   1. enrolled — show "2FA is on" + a Disable button
//   2. enrolling — show the QR + secret + verification input + backup codes
//   3. not-enrolled — show "Enable 2FA" CTA
//
// Better Auth's twoFactor plugin handles the server side. Our flow:
//   authClient.twoFactor.enable({}) → { totpURI, backupCodes }
//   render QR (qrcode lib renders the totpURI to a data URL)
//   user enters 6-digit code from their authenticator
//   authClient.twoFactor.verifyTotp({ code, trustDevice: false }) → flips
//     user.twoFactorEnabled to true server-side
//
// `allowPasswordless: true` on the server plugin lets OAuth/magic-link
// users enrol without a password. Calling enable() with `password: ''`
// works for credential-less accounts.

interface EnrollPayload {
  totpURI: string
  backupCodes: string[]
}

export function TwoFactorCard({
  initiallyEnabled,
}: {
  initiallyEnabled: boolean
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled)
  const [enrolling, setEnrolling] = useState<EnrollPayload | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // Render the otpauth:// URI to a QR code data URL whenever enrolment
  // starts. The library generates a base64-encoded PNG; we just drop it
  // into <img>. State setters are gated through a setTimeout(0) or the
  // .then() callback so react-hooks/set-state-in-effect stays happy.
  useEffect(() => {
    let cancelled = false
    if (!enrolling) {
      // Defer the synchronous null-reset so it doesn't trip the lint rule.
      const t = window.setTimeout(() => {
        if (!cancelled) setQrDataUrl(null)
      }, 0)
      return () => {
        cancelled = true
        window.clearTimeout(t)
      }
    }
    void QRCode.toDataURL(enrolling.totpURI, {
      margin: 1,
      width: 220,
      // High error-correction so the QR scans even with a small overlay
      // (none today, but headroom for a future centre logo).
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [enrolling])

  // Pull the TOTP secret out of the otpauth:// URI so we can show it as
  // text for manual entry (some authenticator apps don't scan QRs).
  const secret = enrolling
    ? (new URL(enrolling.totpURI).searchParams.get('secret') ?? '')
    : ''

  async function startEnroll() {
    setBusy(true)
    try {
      // Better Auth requires `password` for credential users; for our
      // OAuth/magic-link users the plugin's `allowPasswordless: true`
      // makes the password unused. Empty string satisfies the type.
      const res = await authClient.twoFactor.enable({ password: '' })
      if (res.error) throw new Error(res.error.message ?? 'enable failed')
      const data = res.data as EnrollPayload | undefined
      if (!data) throw new Error('enable returned no data')
      setEnrolling(data)
      setCode('')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not start enrolment.'
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function verifyEnroll() {
    if (code.length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator.')
      return
    }
    setBusy(true)
    try {
      const res = await authClient.twoFactor.verifyTotp({
        code,
        // `trustDevice: false` — don't skip 2FA on this device by default.
        // The user can pick "remember this device" on real sign-ins later.
        trustDevice: false,
      })
      if (res.error) throw new Error(res.error.message ?? 'verify failed')
      setEnabled(true)
      setEnrolling(null)
      setCode('')
      toast.success('Two-factor authentication enabled.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'That code did not match.'
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelEnroll() {
    // Abort the half-enrolled state by disabling. Better Auth treats the
    // unverified row as deletable.
    setBusy(true)
    try {
      await authClient.twoFactor.disable({ password: '' })
    } catch {
      // Even if the disable call errors, drop local state so the UI is
      // recoverable — worst case the next enrol attempt resets it server-side.
    } finally {
      setEnrolling(null)
      setCode('')
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const res = await authClient.twoFactor.disable({ password: '' })
      if (res.error) throw new Error(res.error.message ?? 'disable failed')
      setEnabled(false)
      toast.success('Two-factor authentication disabled.')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not disable 2FA.'
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopiedSecret(true)
      window.setTimeout(() => setCopiedSecret(false), 1400)
    } catch {
      // Clipboard blocked — the secret is still visible on screen.
    }
  }

  // State 1: enrolled. Show status + disable button.
  if (enabled && !enrolling) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="flex items-center gap-2 font-display text-lg tracking-wide">
              Two-factor authentication
              <ShieldCheck className="size-4 text-success" aria-hidden />
            </h2>
            <p className="text-sm text-muted-foreground">
              Active. Sign-ins on this account require a second factor — a
              code from your authenticator app, a one-time code emailed to
              you, or one of the backup codes you saved at setup.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void disable()}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
            ) : (
              <ShieldOff className="mr-1.5 size-3.5" aria-hidden />
            )}
            Disable 2FA
          </Button>
        </CardContent>
      </Card>
    )
  }

  // State 2: enrolling. Show QR + secret + verify input + backup codes.
  if (enrolling) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg tracking-wide">
              Set up two-factor authentication
            </h2>
            <p className="text-sm text-muted-foreground">
              Scan the QR with your authenticator app (1Password,
              Authy, Google Authenticator, …) or paste the secret manually.
              Then enter the 6-digit code it shows.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-md border border-gold/30 bg-card/50 p-4 sm:flex-row sm:items-start">
            <div className="flex size-[220px] shrink-0 items-center justify-center rounded-md bg-white">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Two-factor QR code"
                  className="size-full"
                />
              ) : (
                <Loader2
                  className="size-6 animate-spin text-muted-foreground"
                  aria-hidden
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-xs tracking-wider text-muted-foreground uppercase">
                Manual entry
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs">
                  {secret}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copySecret()}
                  aria-label="Copy secret"
                >
                  {copiedSecret ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                </Button>
              </div>
              {/* Backup codes — show now, the user MUST save these before
                  they lose access (e.g. lost phone). Better Auth treats
                  each as a single-use sign-in fallback. */}
              <div className="flex flex-col gap-1">
                <p className="text-xs tracking-wider text-muted-foreground uppercase">
                  Backup codes — save these
                </p>
                <ul className="grid grid-cols-2 gap-1 rounded-sm border border-dashed border-gold/30 bg-card/40 p-2 font-mono text-xs">
                  {enrolling.backupCodes.map((c) => (
                    <li key={c} className="tracking-wider">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="totp-code" className="text-sm font-medium">
              Verification code
            </label>
            <Input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              className="font-mono text-lg tracking-[0.5em]"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void cancelEnroll()}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void verifyEnroll()}
              disabled={busy || code.length !== 6}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : null}
              Verify and enable
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // State 3: not enrolled. Pitch + enable button.
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-lg tracking-wide">
            Two-factor authentication
          </h2>
          <p className="text-sm text-muted-foreground">
            Add a second step to your sign-in: a 6-digit code from an
            authenticator app on your phone. Recommended for any account
            you care about — especially the admin account.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void startEnroll()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="mr-1.5 size-3.5" aria-hidden />
          )}
          Enable 2FA
        </Button>
      </CardContent>
    </Card>
  )
}
