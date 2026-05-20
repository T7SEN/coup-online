import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { fetchWorker } from '@/lib/worker-fetch'
import { cn, ordinal } from '@/lib/utils'
import { ProfileCrest } from '../profile-crest'
import { ProfileCrestView } from '../profile-crest-view'
import { HOVER, RatingTrendCard, SectionTitle, Stat } from '../profile-sections'

// A player's profile — one page, two modes. If the signed-in viewer is
// looking at their OWN profile they get the editable crest plus their recent
// match history; anyone else (signed out, or signed in and viewing someone
// else) gets a read-only crest and no match list — match history is
// participant-only (SKILL.md § 3.6).
//
// Server Component. Ownership is decided by fetching the viewer's own
// /api/me/profile with their cookie: if its userId matches the route param,
// they own this profile (and that response already carries `matches`).
// Otherwise the public /api/profile/:userId supplies the display data. D1 is
// Worker-owned, so this page only ever talks to the Worker over HTTP.

export const metadata: Metadata = { title: 'Profile — Coup Online' }
export const dynamic = 'force-dynamic'

interface ProfileData {
  user: {
    userId: string
    displayName: string
    image: string | null
    rating: number
    rank: number
    profileColor: string
    profileImage: string | null
  }
  stats: { played: number; wins: number }
  // Present only on the owner's own /api/me/profile response.
  matches?: {
    matchId: string
    endedAt: number
    seatCount: number
    finishingPosition: number
    ratingChange: number
  }[]
  ratingHistory: { at: number; rating: number }[]
}

// The viewer's own profile (with match history). 'unauthorized' = no valid
// session; null = the Worker reachable but returned something unexpected.
// Network / 5xx failures redirect to /maintenance inside fetchWorker and
// never surface here.
async function fetchOwnProfile(
  cookie: string,
): Promise<ProfileData | 'unauthorized' | null> {
  const res = await fetchWorker('/api/me/profile', {
    headers: { cookie },
    cache: 'no-store',
  })
  if (res.status === 401) return 'unauthorized'
  if (!res.ok) return null
  return (await res.json()) as ProfileData
}

// Any player's public profile. 'not-found' = no such user; null = the Worker
// reachable but returned something unexpected. Network / 5xx → /maintenance
// inside fetchWorker.
async function fetchPublicProfile(
  userId: string,
): Promise<ProfileData | 'not-found' | null> {
  const res = await fetchWorker(
    `/api/profile/${encodeURIComponent(userId)}`,
    { cache: 'no-store' },
  )
  if (res.status === 404) return 'not-found'
  if (!res.ok) return null
  return (await res.json()) as ProfileData
}

// Fixed ISO date (YYYY-MM-DD) — locale/timezone-stable for server rendering.
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function ProfileBody({
  data,
  isOwner,
}: {
  data: ProfileData
  isOwner: boolean
}) {
  const { user, stats, ratingHistory } = data
  const matches = data.matches ?? []
  const losses = Math.max(0, stats.played - stats.wins)
  const winRate =
    stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      {/* Identity crest — editable for the owner, read-only for everyone else. */}
      {isOwner ? (
        <ProfileCrest
          displayName={user.displayName}
          image={user.image}
          rank={user.rank}
          rating={user.rating}
          profileColor={user.profileColor}
          profileImage={user.profileImage}
        />
      ) : (
        <ProfileCrestView
          displayName={user.displayName}
          image={user.image}
          rank={user.rank}
          rating={user.rating}
          profileColor={user.profileColor}
          profileImage={user.profileImage}
        />
      )}

      {/* Record. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Played" value={String(stats.played)} />
        <Stat label="Wins" value={String(stats.wins)} />
        <Stat label="Losses" value={String(losses)} />
        <Stat label="Win rate" value={`${winRate}%`} />
      </div>

      {ratingHistory.length >= 2 && (
        <RatingTrendCard history={ratingHistory} />
      )}

      {/* Recent matches — owner only (participant-only, SKILL.md § 3.6). */}
      {isOwner && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <SectionTitle>Recent matches</SectionTitle>
              {matches.length > 0 && (
                <Link
                  href={`/profile/${user.userId}/history`}
                  className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground transition-colors hover:text-gold"
                >
                  View all &rarr;
                </Link>
              )}
            </div>
            {matches.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No matches played yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {matches.map((m) => {
                  const won = m.finishingPosition === 1
                  const gain = m.ratingChange >= 0
                  return (
                    <li key={m.matchId}>
                      <Link
                        href={`/match/${m.matchId}`}
                        className={cn(
                          'flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm',
                          HOVER,
                          'hover:border-gold/40',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 min-w-12 shrink-0 items-center justify-center rounded-full px-2 text-xs font-medium',
                            won
                              ? 'border border-gold/50 bg-gold/15 text-gold'
                              : 'border border-border text-muted-foreground',
                          )}
                        >
                          {won ? 'Won' : ordinal(m.finishingPosition)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          of {m.seatCount} players · {isoDate(m.endedAt)}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 font-display tabular-nums',
                            gain ? 'text-success' : 'text-muted-foreground',
                          )}
                        >
                          {gain ? '+' : '−'}
                          {Math.abs(m.ratingChange)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const cookie = (await headers()).get('cookie') ?? ''

  // Discover the viewer (if signed in) by fetching their own profile — its
  // userId tells us whether they own the profile being viewed.
  let own: ProfileData | null = null
  if (cookie.length > 0) {
    const res = await fetchOwnProfile(cookie)
    if (res !== 'unauthorized' && res !== null) own = res
  }
  const isOwner = own !== null && own.user.userId === userId

  // Owner: reuse the /api/me/profile response (it has match history).
  // Otherwise: pull the public profile for the requested user.
  let data: ProfileData | null
  if (isOwner) {
    data = own
  } else {
    const pub = await fetchPublicProfile(userId)
    if (pub === 'not-found') notFound()
    data = pub
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      {!isOwner && (
        <Link
          href="/leaderboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Leaderboard
        </Link>
      )}

      {data === null ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&rsquo;t load this profile</AlertTitle>
          <AlertDescription>
            The game server didn&rsquo;t respond. Try again in a moment.
          </AlertDescription>
        </Alert>
      ) : (
        <ProfileBody data={data} isOwner={isOwner} />
      )}
    </main>
  )
}
