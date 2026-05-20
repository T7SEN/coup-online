import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  account,
  friendRequests,
  friends,
  matchPlayers,
  matches,
  mmrHistory,
  session,
  user,
  type NewMatch,
  type NewMatchPlayer,
  type NewMmrHistory,
} from './schema'

// All queries take the Drizzle D1 database handle as their first argument so
// the Worker can manage instance lifecycle. Construct via createDb(env.DB)
// in `apps/game-server/src/`.

export type Db = DrizzleD1Database<Record<string, never>>

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------

export async function getUserById(db: Db, id: string) {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

// Profile edits. `displayName` is the project-side nickname (shown in-game and
// on the leaderboard, falling back to `name`); `image` is the avatar URL —
// after a custom upload, a Worker /api/avatars/* URL. Callers validate input.
export async function updateUserDisplayName(
  db: Db,
  userId: string,
  displayName: string,
) {
  await db.update(user).set({ displayName }).where(eq(user.id, userId))
}

export async function updateUserImage(db: Db, userId: string, image: string) {
  await db.update(user).set({ image }).where(eq(user.id, userId))
}

// Profile crest banner color — one of a fixed preset palette. The caller
// (Worker /api/me/profile PATCH) validates the key against the allowed set
// before this runs.
export async function updateUserProfileColor(
  db: Db,
  userId: string,
  profileColor: string,
) {
  await db.update(user).set({ profileColor }).where(eq(user.id, userId))
}

// The provider ids a user has linked (e.g. ['google', 'discord']). Empty for
// a magic-link-only account — magic link creates no `account` row. Powers the
// "sign-in method" line on the settings page.
export async function getUserAccountProviders(
  db: Db,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))
  return rows.map((r) => r.providerId)
}

// Account deletion — anonymize, not hard-delete. `match` / `match_player` /
// `mmr_history` reference `user.id`, so the row must survive for referential
// integrity (and the leaderboard / match summaries); it stays as an inert
// "Deleted player". Everything that is PII or a sign-in path is purged:
// linked accounts, sessions, and friend edges. With no `account` and no
// `session` rows the identity can never be used to sign in again.
// `anonEmail` must be unique (the email column is UNIQUE) — callers pass a
// per-user sentinel such as `deleted-<userId>@deleted.invalid`.
export async function deleteUserAccount(
  db: Db,
  userId: string,
  anonEmail: string,
) {
  await db.batch([
    db.delete(account).where(eq(account.userId, userId)),
    db.delete(session).where(eq(session.userId, userId)),
    db
      .delete(friends)
      .where(
        or(eq(friends.userId, userId), eq(friends.friendUserId, userId)),
      ),
    db
      .delete(friendRequests)
      .where(
        or(
          eq(friendRequests.fromUserId, userId),
          eq(friendRequests.toUserId, userId),
        ),
      ),
    db
      .update(user)
      .set({
        name: 'Deleted player',
        displayName: 'Deleted player',
        email: anonEmail,
        image: null,
        profileImage: null,
      })
      .where(eq(user.id, userId)),
  ])
}

// ----------------------------------------------------------------------------
// Matches
// ----------------------------------------------------------------------------

export async function getMatchById(db: Db, matchId: string) {
  const rows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  return rows[0] ?? null
}

export async function getMatchPlayersForMatch(db: Db, matchId: string) {
  return db.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId))
}

// All seats of one match joined with each player's display identity — powers
// the match-summary page. Ordered by finishing position (1 = winner first).
export async function getMatchParticipants(db: Db, matchId: string) {
  return db
    .select({
      userId: matchPlayers.userId,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      seat: matchPlayers.seat,
      finishingPosition: matchPlayers.finishingPosition,
      muBefore: matchPlayers.muBefore,
      sigmaBefore: matchPlayers.sigmaBefore,
      muAfter: matchPlayers.muAfter,
      sigmaAfter: matchPlayers.sigmaAfter,
    })
    .from(matchPlayers)
    .innerJoin(user, eq(user.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, matchId))
    .orderBy(matchPlayers.finishingPosition)
}

// User's recent matches with their per-seat outcome. Ordered newest-first.
export async function getUserMatchHistory(
  db: Db,
  userId: string,
  limit = 20,
  offset = 0,
) {
  return db
    .select({
      matchId: matches.id,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      seatCount: matches.seatCount,
      winnerUserId: matches.winnerUserId,
      finishingPosition: matchPlayers.finishingPosition,
      muBefore: matchPlayers.muBefore,
      muAfter: matchPlayers.muAfter,
      sigmaBefore: matchPlayers.sigmaBefore,
      sigmaAfter: matchPlayers.sigmaAfter,
    })
    .from(matches)
    .innerJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
    .where(eq(matchPlayers.userId, userId))
    .orderBy(desc(matches.endedAt))
    .limit(limit)
    .offset(offset)
}

// All-time match count + wins for a user — for the profile page's win rate.
// Counted over every match_player row, not just the recent-history slice.
export async function getUserMatchStats(db: Db, userId: string) {
  const rows = await db
    .select({
      played: sql<number>`count(*)`,
      wins: sql<number>`sum(case when ${matchPlayers.finishingPosition} = 1 then 1 else 0 end)`,
    })
    .from(matchPlayers)
    .where(eq(matchPlayers.userId, userId))
  return {
    played: Number(rows[0]?.played ?? 0),
    wins: Number(rows[0]?.wins ?? 0),
  }
}

// ----------------------------------------------------------------------------
// Leaderboard — SKILL.md § 3.6 conservative rating (mu - 3*sigma).
// ----------------------------------------------------------------------------

export async function getLeaderboardTop100(db: Db) {
  // Per-user match totals, aggregated over every match_player row. LEFT JOINed
  // onto the rating-sorted user list so players with no matches still appear —
  // their played / wins come back NULL, and the caller coalesces to 0.
  const stats = db
    .select({
      userId: matchPlayers.userId,
      played: sql<number>`count(*)`.as('played'),
      wins: sql<number>`sum(case when ${matchPlayers.finishingPosition} = 1 then 1 else 0 end)`.as(
        'wins',
      ),
    })
    .from(matchPlayers)
    .groupBy(matchPlayers.userId)
    .as('stats')

  return db
    .select({
      id: user.id,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      mu: user.mu,
      sigma: user.sigma,
      rating: sql<number>`(${user.mu} - 3 * ${user.sigma})`.as('rating'),
      played: stats.played,
      wins: stats.wins,
    })
    .from(user)
    .leftJoin(stats, eq(stats.userId, user.id))
    .orderBy(sql`rating DESC`)
    .limit(100)
}

// Player search — case-insensitive substring match on the project nickname
// (displayName) or the provider name, ordered by conservative rating. Powers
// the leaderboard search box. SQLite LIKE is case-insensitive for ASCII, and
// nicknames are English-only (packages/protocol `validateDisplayName`), so a
// plain LIKE suffices. `played` / `wins` come from the same match_player
// aggregate the leaderboard uses; they are NULL for users with no matches.
export async function searchUsersByName(db: Db, query: string, limit = 20) {
  // Strip LIKE wildcards so user input can't widen its own match.
  const term = query.replace(/[%_\\]/g, '').trim()
  if (term.length === 0) return []
  const pattern = `%${term}%`

  const stats = db
    .select({
      userId: matchPlayers.userId,
      played: sql<number>`count(*)`.as('played'),
      wins: sql<number>`sum(case when ${matchPlayers.finishingPosition} = 1 then 1 else 0 end)`.as(
        'wins',
      ),
    })
    .from(matchPlayers)
    .groupBy(matchPlayers.userId)
    .as('stats')

  return db
    .select({
      id: user.id,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      mu: user.mu,
      sigma: user.sigma,
      rating: sql<number>`(${user.mu} - 3 * ${user.sigma})`.as('rating'),
      played: stats.played,
      wins: stats.wins,
    })
    .from(user)
    .leftJoin(stats, eq(stats.userId, user.id))
    .where(or(like(user.displayName, pattern), like(user.name, pattern)))
    .orderBy(sql`rating DESC`)
    .limit(limit)
}

// Leaderboard standing for a given conservative rating — 1 + the count of
// users rated strictly higher. Powers the rank badge on the profile page.
// Ties (extremely rare on a continuous float rating) share a rank.
export async function getRankForRating(db: Db, rating: number) {
  const rows = await db
    .select({ above: sql<number>`count(*)` })
    .from(user)
    .where(sql`(${user.mu} - 3 * ${user.sigma}) > ${rating}`)
  return Number(rows[0]?.above ?? 0) + 1
}

// ----------------------------------------------------------------------------
// Rating history — for the profile page's rating-over-time graph.
// ----------------------------------------------------------------------------

export async function getUserRatingHistory(db: Db, userId: string, limit = 50) {
  return db
    .select()
    .from(mmrHistory)
    .where(eq(mmrHistory.userId, userId))
    .orderBy(desc(mmrHistory.createdAt))
    .limit(limit)
}

// ----------------------------------------------------------------------------
// Friends
// ----------------------------------------------------------------------------

export async function getFriendsList(db: Db, userId: string) {
  return db
    .select({
      friendUserId: friends.friendUserId,
      createdAt: friends.createdAt,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
    })
    .from(friends)
    .innerJoin(user, eq(user.id, friends.friendUserId))
    .where(eq(friends.userId, userId))
}

export async function getIncomingFriendRequests(db: Db, userId: string) {
  return db
    .select({
      fromUserId: friendRequests.fromUserId,
      createdAt: friendRequests.createdAt,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
    })
    .from(friendRequests)
    .innerJoin(user, eq(user.id, friendRequests.fromUserId))
    .where(eq(friendRequests.toUserId, userId))
}

export async function getOutgoingFriendRequests(db: Db, userId: string) {
  return db
    .select({
      toUserId: friendRequests.toUserId,
      createdAt: friendRequests.createdAt,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
    })
    .from(friendRequests)
    .innerJoin(user, eq(user.id, friendRequests.toUserId))
    .where(eq(friendRequests.fromUserId, userId))
}

// ----------------------------------------------------------------------------
// Match result persistence — SKILL.md § 3.6.
// ----------------------------------------------------------------------------

// Inputs aggregated from packages/rating's RatingDelta + game-logic's final state.
// One call writes: matches row, N match_player rows, N mmr_history rows,
// and updates user.mu / user.sigma for each player.
//
// D1's batch API is invoked via db.batch() for atomicity. SKILL.md § 5 — this
// is the LAST step of endGame(); if it fails, retry (don't roll back match data
// elsewhere).
export interface InsertMatchResultInput {
  readonly match: NewMatch
  readonly players: readonly NewMatchPlayer[]
  readonly history: readonly NewMmrHistory[]
}

export async function insertMatchResult(db: Db, input: InsertMatchResultInput) {
  const updates = input.players.map((p) =>
    db
      .update(user)
      .set({ mu: p.muAfter, sigma: p.sigmaAfter })
      .where(eq(user.id, p.userId)),
  )
  const inserts = [
    db.insert(matches).values(input.match),
    db.insert(matchPlayers).values([...input.players]),
    db.insert(mmrHistory).values([...input.history]),
  ]
  // db.batch() takes a non-empty tuple of prepared statements. We have at least
  // one of each (one match + N≥3 players + N≥3 history rows + N≥3 user updates).
  const ops = [...inserts, ...updates] as unknown as Parameters<typeof db.batch>[0]
  await db.batch(ops)
}

// ----------------------------------------------------------------------------
// Friend mutations
// ----------------------------------------------------------------------------

export async function sendFriendRequest(
  db: Db,
  fromUserId: string,
  toUserId: string,
) {
  await db.insert(friendRequests).values({ fromUserId, toUserId })
}

// Accept a pending friend request: insert two friend rows (A→B and B→A) and
// delete the pending request. Atomic via db.batch().
export async function acceptFriendRequest(
  db: Db,
  fromUserId: string,
  toUserId: string,
) {
  await db.batch([
    db.insert(friends).values({ userId: fromUserId, friendUserId: toUserId }),
    db.insert(friends).values({ userId: toUserId, friendUserId: fromUserId }),
    db
      .delete(friendRequests)
      .where(
        and(
          eq(friendRequests.fromUserId, fromUserId),
          eq(friendRequests.toUserId, toUserId),
        ),
      ),
  ])
}

export async function rejectFriendRequest(
  db: Db,
  fromUserId: string,
  toUserId: string,
) {
  await db
    .delete(friendRequests)
    .where(
      and(
        eq(friendRequests.fromUserId, fromUserId),
        eq(friendRequests.toUserId, toUserId),
      ),
    )
}

export async function removeFriend(db: Db, userId: string, otherUserId: string) {
  await db.batch([
    db
      .delete(friends)
      .where(
        and(eq(friends.userId, userId), eq(friends.friendUserId, otherUserId)),
      ),
    db
      .delete(friends)
      .where(
        and(eq(friends.userId, otherUserId), eq(friends.friendUserId, userId)),
      ),
  ])
}
