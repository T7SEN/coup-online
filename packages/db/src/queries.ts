import { and, desc, eq, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  friendRequests,
  friends,
  matchPlayers,
  matches,
  mmrHistory,
  users,
  type NewMatch,
  type NewMatchPlayer,
  type NewMmrHistory,
} from './schema'

// All queries take the Drizzle D1 database handle as their first argument so
// the Worker can manage instance lifecycle. Construct via createDb(env.DB)
// in `apps/game-server/src/db.ts`.

export type Db = DrizzleD1Database<Record<string, never>>

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------

export async function getUserById(db: Db, id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return rows[0] ?? null
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

// ----------------------------------------------------------------------------
// Leaderboard — SKILL.md § 3.6 conservative rating (mu - 3*sigma).
// ----------------------------------------------------------------------------

export async function getLeaderboardTop100(db: Db) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      name: users.name,
      image: users.image,
      mu: users.mu,
      sigma: users.sigma,
      rating: sql<number>`(${users.mu} - 3 * ${users.sigma})`.as('rating'),
    })
    .from(users)
    .orderBy(sql`rating DESC`)
    .limit(100)
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
      displayName: users.displayName,
      name: users.name,
      image: users.image,
    })
    .from(friends)
    .innerJoin(users, eq(users.id, friends.friendUserId))
    .where(eq(friends.userId, userId))
}

export async function getIncomingFriendRequests(db: Db, userId: string) {
  return db
    .select({
      fromUserId: friendRequests.fromUserId,
      createdAt: friendRequests.createdAt,
      displayName: users.displayName,
      name: users.name,
      image: users.image,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.fromUserId))
    .where(eq(friendRequests.toUserId, userId))
}

export async function getOutgoingFriendRequests(db: Db, userId: string) {
  return db
    .select({
      toUserId: friendRequests.toUserId,
      createdAt: friendRequests.createdAt,
      displayName: users.displayName,
      name: users.name,
      image: users.image,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.toUserId))
    .where(eq(friendRequests.fromUserId, userId))
}

// ----------------------------------------------------------------------------
// Match result persistence — SKILL.md § 3.6.
// ----------------------------------------------------------------------------

// Inputs aggregated from packages/rating's RatingDelta + game-logic's final state.
// One call writes: matches row, N match_player rows, N mmr_history rows,
// and updates users.mu / users.sigma for each player.
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
      .update(users)
      .set({ mu: p.muAfter, sigma: p.sigmaAfter })
      .where(eq(users.id, p.userId)),
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
