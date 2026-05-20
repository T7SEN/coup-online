import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { fetchWorker } from '@/lib/worker-fetch'
import { cn, ordinal } from '@/lib/utils'
import { HOVER } from '../../profile-sections'

// The dedicated full match-history page. One URL per player —
// /profile/[userId]/history — but participant-only by construction: only the
// signed-in owner of that profile can read it. Anyone else gets 404 (we treat
// "wrong user" and "no session" identically so the existence of someone else's
// history stays private). SKILL.md § 3.6.
//
// Server Component. Two HTTP calls in parallel: /api/me/profile to recover the
// viewer's identity and stats, and /api/me/matches?limit=50 for the long list.
// The profile sidebar's "Recent matches" stays bound to the 20-row slice that
// /api/me/profile already returns; this page is the only consumer of the
// dedicated /api/me/matches endpoint today.

export const metadata: Metadata = { title: 'Match history — Coup Online' }
export const dynamic = 'force-dynamic'

// The matches-list endpoint returns this shape.
interface Match {
  matchId: string
  startedAt: number
  endedAt: number
  seatCount: number
  finishingPosition: number
  ratingChange: number
}

// Subset of /api/me/profile we actually use here.
interface OwnProfile {
  user: {
    userId: string
    displayName: string
    rating: number
    rank: number
  }
  stats: { played: number; wins: number }
}

// Network / 5xx → /maintenance inside fetchWorker. null here only means the
// Worker returned an unexpected non-OK 4xx (e.g. 401 if the session vanished
// mid-request).
async function fetchOwnProfile(cookie: string): Promise<OwnProfile | null> {
  const res = await fetchWorker('/api/me/profile', {
    headers: { cookie },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as OwnProfile
}

// 'error' = Worker reachable but returned an unexpected non-OK. Network / 5xx
// → /maintenance inside fetchWorker.
async function fetchMatches(
  cookie: string,
  limit: number,
): Promise<Match[] | 'error'> {
  const res = await fetchWorker(`/api/me/matches?limit=${limit}`, {
    headers: { cookie },
    cache: 'no-store',
  })
  if (!res.ok) return 'error'
  const j = (await res.json()) as { matches: Match[] }
  return j.matches
}

// SSR-stable date stamp — we format off the UTC components rather than calling
// Intl, so the server output never depends on the runtime's ICU version (Node
// vs Workers).
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function formatStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

// "8m 21s" / "47s" / "1h 12m 03s" — clamps negatives to 0 (clock-skew safety).
function formatDuration(startMs: number, endMs: number): string {
  const secTotal = Math.max(0, Math.round((endMs - startMs) / 1000))
  const h = Math.floor(secTotal / 3600)
  const m = Math.floor((secTotal % 3600) / 60)
  const s = secTotal % 60
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`
  if (m > 0) return `${m}m ${pad(s)}s`
  return `${s}s`
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const cookie = (await headers()).get('cookie') ?? ''

  // No session → 404 (same as wrong-user, to keep existence private).
  if (cookie.length === 0) notFound()

  // Profile is the source of truth for ownership; matches list is fetched in
  // parallel so the page renders in one round-trip (the Worker is local in
  // production — both calls hit the same DO/D1).
  const [ownProfile, matchesResult] = await Promise.all([
    fetchOwnProfile(cookie),
    fetchMatches(cookie, 50),
  ])

  if (!ownProfile) notFound()
  // The viewer must own the profile they are inspecting.
  if (ownProfile.user.userId !== userId) notFound()

  const losses = Math.max(0, ownProfile.stats.played - ownProfile.stats.wins)
  const winRate =
    ownProfile.stats.played > 0
      ? Math.round((ownProfile.stats.wins / ownProfile.stats.played) * 100)
      : 0
  const matches = Array.isArray(matchesResult) ? matchesResult : []
  const matchesErrored = matchesResult === 'error'

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24">
      {/* Back to the profile. */}
      <Link
        href={`/profile/${userId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {ownProfile.user.displayName}&rsquo;s profile
      </Link>

      {/* Header. */}
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          The Chronicle
        </p>
        <h1 className="font-display text-3xl tracking-wide text-balance sm:text-4xl">
          Match history
        </h1>
        <OrnamentDivider className="w-48 max-w-[70vw] text-gold/60" />
        <p className="max-w-xl text-pretty text-muted-foreground">
          Every match{' '}
          <span className="text-foreground">
            {ownProfile.user.displayName}
          </span>{' '}
          has sat at the table — newest first.
        </p>
      </header>

      {/* Compact record strip. */}
      <div className="mx-auto mt-8 grid w-full max-w-md grid-cols-4 gap-px overflow-hidden rounded-md border border-gold/30 bg-gold/15 text-center">
        {[
          { label: 'Played', value: String(ownProfile.stats.played) },
          { label: 'Wins', value: String(ownProfile.stats.wins) },
          { label: 'Losses', value: String(losses) },
          { label: 'Win rate', value: `${winRate}%` },
        ].map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 bg-card px-2 py-3"
          >
            <span className="font-display text-lg tabular-nums sm:text-xl">
              {s.value}
            </span>
            <span className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* The list. */}
      <section className="mt-10">
        {matchesErrored ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&rsquo;t load the history</AlertTitle>
            <AlertDescription>
              The game server didn&rsquo;t respond. Try again in a moment.
            </AlertDescription>
          </Alert>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-gold/30 bg-card/40 px-6 py-10 text-center">
            <p className="font-display text-base tracking-wide text-foreground">
              No matches played yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Take a seat in{' '}
              <Link
                href="/play"
                className="text-foreground underline-offset-4 hover:text-gold hover:underline"
              >
                /play
              </Link>{' '}
              — the chronicle fills as you play.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {matches.map((m) => {
              const won = m.finishingPosition === 1
              const gained = m.ratingChange >= 0
              return (
                <li key={m.matchId}>
                  <Link
                    href={`/match/${m.matchId}`}
                    className={cn(
                      'group flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-4',
                      HOVER,
                      'hover:border-gold/45',
                    )}
                  >
                    {/* Result chip. */}
                    <span
                      className={cn(
                        'inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1 rounded-full px-3 font-display text-xs tracking-wider uppercase',
                        won
                          ? 'border border-gold/55 bg-gold/15 text-gold'
                          : 'border border-border text-muted-foreground',
                      )}
                    >
                      {won ? 'Won' : ordinal(m.finishingPosition)}
                      <span className="text-[10px] tracking-wide text-muted-foreground/80 normal-case">
                        of {m.seatCount}
                      </span>
                    </span>

                    {/* Date + duration. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-0">
                      <p className="text-sm font-medium text-foreground tabular-nums">
                        {formatStamp(m.endedAt)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatDuration(m.startedAt, m.endedAt)}
                      </p>
                    </div>

                    {/* Rating delta. */}
                    <span
                      className={cn(
                        'shrink-0 self-start font-display text-base tabular-nums sm:self-center',
                        gained ? 'text-success' : 'text-muted-foreground',
                      )}
                    >
                      {gained ? '+' : '−'}
                      {Math.abs(m.ratingChange)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Note when we know we're at the API cap. */}
      {matches.length >= 50 && (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Showing the 50 most recent matches.
        </p>
      )}
    </main>
  )
}
