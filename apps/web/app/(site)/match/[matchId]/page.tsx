import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Crown } from 'lucide-react'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { fetchWorker } from '@/lib/worker-fetch'
import { cn, ordinal } from '@/lib/utils'

// A finished match's summary — final standings and per-seat rating deltas.
// Server Component: forwards the session cookie to the Worker's
// /api/me/matches/:matchId. That route is participant-only (SKILL.md § 3.6),
// so a 403 (not a participant) and a 404 (no such match) are treated the same
// here — `notFound()` — keeping a match's existence private to its players.

export const metadata: Metadata = { title: 'Match result — Coup Online' }
export const dynamic = 'force-dynamic'

// Shared hover lift for the winner banner + standing rows.
const HOVER =
  'transition duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md'

interface MatchPlayer {
  userId: string
  displayName: string
  image: string | null
  seat: number
  finishingPosition: number
  ratingBefore: number
  ratingAfter: number
  ratingChange: number
}

interface MatchData {
  match: {
    matchId: string
    startedAt: number
    endedAt: number
    seatCount: number
    winnerUserId: string
  }
  viewerUserId: string
  players: MatchPlayer[]
}

// Network / 5xx → /maintenance inside fetchWorker. null here means the Worker
// returned an unexpected non-OK 4xx other than 401/403/404 — "shouldn't
// normally happen".
async function fetchMatch(
  matchId: string,
  cookie: string,
): Promise<MatchData | 'unauthorized' | 'not-found' | null> {
  const res = await fetchWorker(
    `/api/me/matches/${encodeURIComponent(matchId)}`,
    { headers: { cookie }, cache: 'no-store' },
  )
  if (res.status === 401) return 'unauthorized'
  // 403 (not a participant) is folded into 'not-found' so the page never
  // confirms a match exists to someone who wasn't in it.
  if (res.status === 403 || res.status === 404) return 'not-found'
  if (!res.ok) return null
  return (await res.json()) as MatchData
}

// Fixed ISO date (YYYY-MM-DD) — locale/timezone-stable for server rendering.
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// Match length, e.g. "12m" / "12m 30s" / "45s".
function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// A signed rating delta, e.g. "+18" / "−6".
function RatingDelta({
  change,
  className,
}: {
  change: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'font-display tabular-nums',
        change >= 0 ? 'text-success' : 'text-muted-foreground',
        className,
      )}
    >
      {change >= 0 ? '+' : '−'}
      {Math.abs(change)}
    </span>
  )
}

function YouChip() {
  return (
    <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-widest text-gold uppercase">
      You
    </span>
  )
}

function MatchBody({ data }: { data: MatchData }) {
  const { match, players, viewerUserId } = data
  const winner = players[0]
  const rest = players.slice(1)
  const viewerWon = winner?.userId === viewerUserId

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Match result
        </p>
        <h1
          dir="auto"
          className="font-display text-3xl tracking-wide text-balance sm:text-4xl"
        >
          {viewerWon ? 'You won' : `${winner?.displayName ?? 'Nobody'} won`}
        </h1>
        <OrnamentDivider className="w-44 max-w-[70%] text-gold/60" />
        <p className="text-sm text-muted-foreground">
          {isoDate(match.endedAt)} · {match.seatCount} players ·{' '}
          {formatDuration(match.endedAt - match.startedAt)}
        </p>
      </header>

      {/* Winner banner. */}
      {winner && (
        <Link
          href={`/profile/${winner.userId}`}
          className={cn(
            'flex items-center gap-4 rounded-lg border border-gold/50 bg-gold/10 p-5 shadow-md hover:border-gold/70',
            HOVER,
          )}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold bg-gold/25 text-gold">
            <Crown className="size-5" aria-hidden />
          </span>
          <Avatar className="size-14 shrink-0 border border-gold/40 sm:size-16">
            <AvatarImage src={winner.image ?? undefined} alt="" />
            <AvatarFallback className="text-sm">
              {winner.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-gold/80 uppercase">
              Victor
              {winner.userId === viewerUserId && <YouChip />}
            </p>
            <h2 dir="auto" className="truncate font-display text-xl tracking-wide">
              {winner.displayName}
            </h2>
            <p className="text-sm text-muted-foreground">
              Seat {winner.seat + 1}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <RatingDelta change={winner.ratingChange} className="text-2xl" />
            <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase">
              Rating
            </p>
          </div>
        </Link>
      )}

      {/* Remaining standings. */}
      {rest.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {rest.map((p) => {
            const isViewer = p.userId === viewerUserId
            return (
              <li key={p.userId}>
                <Link
                  href={`/profile/${p.userId}`}
                  className={cn(
                    'flex items-center gap-3 rounded-md border bg-card px-3 py-2.5',
                    HOVER,
                    isViewer
                      ? 'border-gold/40'
                      : 'border-border hover:border-gold/40',
                  )}
                >
                  <span className="w-9 shrink-0 text-center font-display text-sm tabular-nums text-muted-foreground">
                    {ordinal(p.finishingPosition)}
                  </span>
                  <Avatar className="size-9 shrink-0">
                    <AvatarImage src={p.image ?? undefined} alt="" />
                    <AvatarFallback className="text-sm">
                      {p.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p
                      dir="auto"
                      className="flex items-center gap-2 truncate font-medium"
                    >
                      {p.displayName}
                      {isViewer && <YouChip />}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seat {p.seat + 1}
                    </p>
                  </div>
                  <RatingDelta change={p.ratingChange} className="text-lg" />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>
}) {
  const { matchId } = await params
  const cookie = (await headers()).get('cookie') ?? ''
  if (cookie.length === 0) redirect('/auth/signin')

  const data = await fetchMatch(matchId, cookie)
  if (data === 'unauthorized') redirect('/auth/signin')
  if (data === 'not-found') notFound()

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      {data !== null && (
        <Link
          href={`/profile/${data.viewerUserId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Your profile
        </Link>
      )}

      {data === null ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&rsquo;t load this match</AlertTitle>
          <AlertDescription>
            The game server didn&rsquo;t respond. Try again in a moment.
          </AlertDescription>
        </Alert>
      ) : (
        <MatchBody data={data} />
      )}
    </main>
  )
}
