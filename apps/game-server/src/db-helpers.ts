import {
  createDb,
  insertMatchResult,
  users,
  type Db,
  type NewMatch,
  type NewMatchPlayer,
  type NewMmrHistory,
} from '@coup-online/db'
import type { GameState } from '@coup-online/game-logic'
import { rateMatch, type SeatResult } from '@coup-online/rating'
import { inArray } from 'drizzle-orm'

// SKILL.md § 5 — Web Crypto only; never node:crypto. globalThis cast is the
// strict-mode pattern for accessing browser globals from non-DOM Worker context.
const webCrypto = (
  globalThis as unknown as { crypto: { randomUUID(): string } }
).crypto

// Defaults match packages/rating/constants.ts. Inlined to avoid a runtime import
// from rating just for two numbers when seeding new dev users.
const INITIAL_MU = 25
const INITIAL_SIGMA = 25 / 3

export interface PlayerMeta {
  readonly playerId: string
  readonly displayName: string
}

// SKILL.md § 3.6 / § 5 — final step of endGame(). Best-effort: the caller logs
// and continues if this throws; the game-end notification still goes out.
//
// Pipeline:
//   1. Ensure each player has a `user` row. Auth.js v5 owns this in production;
//      the dev-token bridge seeds minimal rows here so the match_player FK
//      passes. Synthetic email "<playerId>@dev.local" is replaced once Auth.js
//      v5 lands and the dev-token endpoint is retired.
//   2. Snapshot pre-match mu/sigma from those rows (post-ensure, so missing
//      rows pick up schema defaults of 25 / 25/3).
//   3. Build SeatResult[] from the final GameState. v1 ranks the winner as
//      finishingPosition=1 and everyone else as 2 (TrueSkill handles tied
//      ranks). True elimination order needs a per-seat `eliminatedAtTurn`
//      field — future pass; not yet tracked.
//   4. Call rateMatch() → RatingDelta[].
//   5. db.batch() one match + N match_player + N mmr_history + N user-updates,
//      atomic per insertMatchResult.
export async function persistMatchResult(
  d1: D1Database,
  finalState: GameState,
  players: readonly PlayerMeta[],
  startedAt: number,
  endedAt: number,
): Promise<void> {
  const db = createDb(d1)

  await ensureUsers(db, players)

  const userIds = players.map((p) => p.playerId)
  const existing = await db
    .select({ id: users.id, mu: users.mu, sigma: users.sigma })
    .from(users)
    .where(inArray(users.id, userIds))
  const ratingByUserId = new Map<string, { mu: number; sigma: number }>(
    existing.map((u) => [u.id, { mu: u.mu, sigma: u.sigma }]),
  )

  const winner = finalState.seats.find((s) => s.isAlive)
  if (!winner) {
    throw new Error('persistMatchResult: no alive seat at GAME_OVER')
  }

  const seatResults: SeatResult[] = finalState.seats.map((seat) => {
    const rating = ratingByUserId.get(seat.playerId) ?? {
      mu: INITIAL_MU,
      sigma: INITIAL_SIGMA,
    }
    return {
      playerId: seat.playerId,
      mu: rating.mu,
      sigma: rating.sigma,
      finishingPosition: seat.playerId === winner.playerId ? 1 : 2,
    }
  })

  const deltas = rateMatch(seatResults)
  const deltaByPlayerId = new Map(deltas.map((d) => [d.playerId, d]))

  const matchId = finalState.matchId
  const match: NewMatch = {
    id: matchId,
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    winnerUserId: winner.playerId,
    seatCount: finalState.seats.length,
  }

  const matchPlayersRows: NewMatchPlayer[] = finalState.seats.map((seat, i) => {
    const delta = deltaByPlayerId.get(seat.playerId)
    if (!delta) {
      throw new Error(`persistMatchResult: no delta for player "${seat.playerId}"`)
    }
    return {
      matchId,
      userId: seat.playerId,
      seat: i,
      finishingPosition: seat.playerId === winner.playerId ? 1 : 2,
      muBefore: delta.muBefore,
      sigmaBefore: delta.sigmaBefore,
      muAfter: delta.muAfter,
      sigmaAfter: delta.sigmaAfter,
    }
  })

  const history: NewMmrHistory[] = deltas.map((d) => ({
    id: webCrypto.randomUUID(),
    userId: d.playerId,
    matchId,
    muBefore: d.muBefore,
    sigmaBefore: d.sigmaBefore,
    muAfter: d.muAfter,
    sigmaAfter: d.sigmaAfter,
  }))

  await insertMatchResult(db, {
    match,
    players: matchPlayersRows,
    history,
  })
}

async function ensureUsers(db: Db, players: readonly PlayerMeta[]): Promise<void> {
  const userIds = players.map((p) => p.playerId)
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, userIds))
  const existingSet = new Set(existing.map((u) => u.id))
  const missing = players.filter((p) => !existingSet.has(p.playerId))
  if (missing.length === 0) return
  // Synthetic dev email. Auth.js v5 owns this flow in production; this branch
  // exists so the dev-token bridge doesn't crash on first game-end. The Auth.js
  // wiring will replace the dev-token endpoint entirely (SKILL.md § 5).
  await db.insert(users).values(
    missing.map((p) => ({
      id: p.playerId,
      email: `${p.playerId}@dev.local`,
      name: p.displayName,
      displayName: p.displayName,
    })),
  )
}
