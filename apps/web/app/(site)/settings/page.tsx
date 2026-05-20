import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { GAME_SERVER_HTTP } from '@/lib/config'
import { DeleteAccountCard, SignOutButton } from './settings-actions'

// Account settings. Server Component: forwards the session cookie to the
// Worker's /api/me/account (D1 is Worker-owned). No session → sign-in. The
// account-info display is read-only; nickname / avatar / banner are edited on
// the profile page, so this only links there. The interactive bits — sign out,
// delete account — are the client island in ./settings-actions.

export const metadata: Metadata = { title: 'Settings — Coup Online' }
export const dynamic = 'force-dynamic'

interface AccountData {
  userId: string
  email: string
  displayName: string
  joinedAt: number
  providers: string[]
}

async function fetchAccount(
  cookie: string,
): Promise<AccountData | 'unauthorized' | null> {
  try {
    const res = await fetch(`${GAME_SERVER_HTTP}/api/me/account`, {
      headers: { cookie },
      cache: 'no-store',
    })
    if (res.status === 401) return 'unauthorized'
    if (!res.ok) return null
    return (await res.json()) as AccountData
  } catch {
    return null
  }
}

// Locale/timezone-stable date for server rendering.
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// Human label for the linked sign-in providers — empty means magic link.
function signInMethod(providers: string[]): string {
  if (providers.length === 0) return 'Email link'
  return providers
    .map((p) => (p === 'google' ? 'Google' : p === 'discord' ? 'Discord' : p))
    .join(', ')
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span dir="auto" className="truncate text-sm font-medium">
        {value}
      </span>
    </div>
  )
}

function SettingsBody({ data }: { data: AccountData }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Account details — read-only. */}
      <Card>
        <CardContent className="flex flex-col gap-1">
          <h2 className="font-display text-lg tracking-wide">Account</h2>
          <div className="flex flex-col divide-y divide-border">
            <InfoRow label="Nickname" value={data.displayName} />
            <InfoRow label="Email" value={data.email} />
            <InfoRow
              label="Sign-in method"
              value={signInMethod(data.providers)}
            />
            <InfoRow label="Member since" value={isoDate(data.joinedAt)} />
          </div>
        </CardContent>
      </Card>

      {/* Profile — managed on the profile page. */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg tracking-wide">Profile</h2>
            <p className="text-sm text-muted-foreground">
              Your nickname, avatar and crest banner are managed on your
              profile.
            </p>
          </div>
          <Link
            href={`/profile/${data.userId}`}
            className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Go to your profile
            <ChevronRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      {/* Session. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg tracking-wide">Session</h2>
            <p className="text-sm text-muted-foreground">
              Sign out of Coup Online on this device.
            </p>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>

      {/* Danger zone. */}
      <DeleteAccountCard />
    </div>
  )
}

export default async function SettingsPage() {
  const cookie = (await headers()).get('cookie') ?? ''
  if (cookie.length === 0) redirect('/auth/signin')

  const data = await fetchAccount(cookie)
  if (data === 'unauthorized') redirect('/auth/signin')

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <header className="mb-8 flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Your account
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Settings
        </h1>
        <OrnamentDivider className="w-44 max-w-[70%] text-gold/60" />
      </header>

      {data === null ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&rsquo;t load your settings</AlertTitle>
          <AlertDescription>
            The game server didn&rsquo;t respond. Try again in a moment.
          </AlertDescription>
        </Alert>
      ) : (
        <SettingsBody data={data} />
      )}
    </main>
  )
}
