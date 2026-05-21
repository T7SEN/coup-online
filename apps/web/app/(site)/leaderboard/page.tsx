import type { Metadata } from 'next'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import { GildedName } from '@/components/gilded-name'
import { PatronBadge } from '@/components/patron-badge'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { fetchWorker } from '@/lib/worker-fetch'
import { cn } from '@/lib/utils'
import { LeaderboardSearch } from './leaderboard-search'

// Public leaderboard — top 100 by conservative TrueSkill rating (SKILL.md
// § 3.6). Server Component: fetches the Worker's /api/leaderboard directly
// (public route, no cookie). D1 is Worker-owned, so this page never touches
// the database itself. `force-dynamic` keeps it off the build-time prerender
// path. The top three are showcased on a podium; the rest follow as a list.

export const metadata: Metadata = { title: 'Leaderboard — Coup Online' }
export const dynamic = 'force-dynamic'

interface LeaderboardPlayer {
  rank: number
  userId: string
  displayName: string
  image: string | null
  isPatron: boolean
  founderRank: number | null
  patronGildedNickname: boolean
  rating: number
  played: number
  wins: number
}

// Shared hover treatment for the podium cards + ranked rows.
const HOVER =
  'transition duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md'

// Network / 5xx → /maintenance inside fetchWorker. null here means the Worker
// returned an unexpected non-OK 4xx (none are expected from this public route,
// so this is the "shouldn't normally happen" branch).
async function fetchLeaderboard(): Promise<LeaderboardPlayer[] | null> {
  const res = await fetchWorker('/api/leaderboard', { cache: 'no-store' })
  if (!res.ok) return null
  const json = (await res.json()) as { players: LeaderboardPlayer[] }
  return json.players
}

// Win rate as a whole-number percentage; 0 when the player has no matches.
function winRatePct(p: LeaderboardPlayer): number {
  return p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0
}

// Win–loss record, e.g. "34W · 16L".
function recordLabel(p: LeaderboardPlayer): string {
  return `${p.wins}W · ${p.played - p.wins}L`
}

function Initial({ name }: { name: string }) {
  return (
    <AvatarFallback className="text-sm">
      {name.charAt(0).toUpperCase()}
    </AvatarFallback>
  )
}

// Rank 1 — a gilded champion banner. Links to the player's public profile.
function ChampionCard({ player }: { player: LeaderboardPlayer }) {
  return (
    <Link
      href={`/profile/${player.userId}`}
      className={cn(
        'flex items-center gap-4 rounded-lg border border-gold/50 bg-gold/10 p-5 shadow-md hover:border-gold/70',
        HOVER,
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold bg-gold/25 text-gold">
        <Crown className="size-5" />
      </span>
      <Avatar className="size-14 shrink-0 border border-gold/40 sm:size-16">
        <AvatarImage src={player.image ?? undefined} alt="" />
        <Initial name={player.displayName} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-[0.2em] text-gold/80 uppercase">
          Champion
        </p>
        <h2 className="flex items-center gap-2 truncate font-display text-xl tracking-wide">
          <GildedName
            name={player.displayName}
            gilded={player.patronGildedNickname}
            dir="auto"
            className="truncate"
          />
          <PatronBadge
            isPatron={player.isPatron}
            founderRank={player.founderRank}
            size="sm"
          />
        </h2>
        <p className="text-sm text-muted-foreground">
          {recordLabel(player)} · {winRatePct(player)}% wins
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-3xl tabular-nums text-primary">
          {player.rating}
        </p>
        <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase">
          Rating
        </p>
      </div>
    </Link>
  )
}

// Ranks 2 & 3 — paired podium cards. Each links to the player's profile.
function RunnerUp({ player }: { player: LeaderboardPlayer }) {
  return (
    <Link
      href={`/profile/${player.userId}`}
      className={cn(
        'flex flex-col items-center gap-2 rounded-md border border-gold/25 bg-card/50 p-4 text-center hover:border-gold/45',
        HOVER,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-gold/40 font-display text-sm tabular-nums text-gold/90">
        {player.rank}
      </span>
      <Avatar className="size-12 border border-gold/30">
        <AvatarImage src={player.image ?? undefined} alt="" />
        <Initial name={player.displayName} />
      </Avatar>
      <h3 className="flex w-full items-center justify-center gap-1.5 truncate font-display tracking-wide">
        <GildedName
          name={player.displayName}
          gilded={player.patronGildedNickname}
          dir="auto"
          className="truncate"
        />
        <PatronBadge
          isPatron={player.isPatron}
          founderRank={player.founderRank}
          size="xs"
        />
      </h3>
      <p className="font-display text-xl tabular-nums text-primary">
        {player.rating}
      </p>
      <p className="text-xs text-muted-foreground">
        {recordLabel(player)} · {winRatePct(player)}%
      </p>
    </Link>
  )
}

// Ranks 4+ — a compact row, linking to the player's profile.
function RankRow({ player }: { player: LeaderboardPlayer }) {
  return (
    <li>
      <Link
        href={`/profile/${player.userId}`}
        className={cn(
          'flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 hover:border-gold/40',
          HOVER,
        )}
      >
        <span className="w-6 shrink-0 text-center font-display text-sm tabular-nums text-muted-foreground">
          {player.rank}
        </span>
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={player.image ?? undefined} alt="" />
          <Initial name={player.displayName} />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-medium">
            <GildedName
              name={player.displayName}
              gilded={player.patronGildedNickname}
              dir="auto"
              className="truncate"
            />
            <PatronBadge
              isPatron={player.isPatron}
              founderRank={player.founderRank}
              size="xs"
            />
          </p>
          <p className="text-xs text-muted-foreground">
            {recordLabel(player)} · {winRatePct(player)}%
          </p>
        </div>
        <span className="shrink-0 font-display text-lg tabular-nums">
          {player.rating}
        </span>
      </Link>
    </li>
  )
}

export default async function LeaderboardPage() {
  const players = await fetchLeaderboard()
  const champion = players?.[0] ?? null
  const runnersUp = players?.slice(1, 3) ?? []
  const rest = players?.slice(3) ?? []

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Ranked play
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Leaderboard
        </h1>
        <OrnamentDivider className="w-44 max-w-[70%] text-gold/60" />
        <p className="text-sm text-muted-foreground">
          The top 100 challengers, by conservative TrueSkill rating.
        </p>
      </header>

      {/* Search any ranked player — not just the top 100 shown below. */}
      <div className="mb-8">
        <LeaderboardSearch />
      </div>

      {players === null ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&rsquo;t load the leaderboard</AlertTitle>
          <AlertDescription>
            The game server didn&rsquo;t respond. Try again in a moment.
          </AlertDescription>
        </Alert>
      ) : players.length === 0 ? (
        <p className="rounded-lg border border-gold/25 bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
          No ranked players yet — finish a match to claim a place at court.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {champion && <ChampionCard player={champion} />}
          {runnersUp.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {runnersUp.map((p) => (
                <RunnerUp key={p.userId} player={p} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {rest.map((p) => (
                <RankRow key={p.userId} player={p} />
              ))}
            </ol>
          )}
        </div>
      )}
    </main>
  )
}
