import {
  createDb,
  insertMatchResult,
  user,
  type NewMatch,
  type NewMatchPlayer,
  type NewMmrHistory,
} from '@coup-online/db'
import { computeFinishingPositions, type GameState } from '@coup-online/game-logic'
import { rateMatch, type SeatResult } from '@coup-online/rating'
import { inArray } from 'drizzle-orm'

// SKILL.md § 5 — Web Crypto only; never node:crypto. globalThis cast is the
// strict-mode pattern for accessing browser globals from non-DOM Worker context.
const webCrypto = (
  globalThis as unknown as { crypto: { randomUUID(): string } }
).crypto

export interface PlayerMeta {
  readonly playerId: string
  readonly displayName: string
}

// SKILL.md § 3.6 / § 5 — final step of endGame(). Best-effort: the caller logs
// and continues if this throws; the game-end notification still goes out.
//
// Pipeline:
//   1. Verify every player has a `user` row. SKILL.md § 1 — no guest play, so
//      Better Auth has already created the row at sign-in. We surface a clear
//      error if the invariant is somehow broken (FK violation otherwise).
//   2. Snapshot pre-match mu/sigma from those rows.
//   3. Build SeatResult[] from the final GameState. computeFinishingPositions()
//      derives each seat's 1-based finishing position from its eliminationOrder
//      (reverse elimination order — last eliminated places highest), so
//      TrueSkill sees the true N-way ranking instead of winner=1 / rest tied.
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

  const userIds = players.map((p) => p.playerId)
  const existing = await db
    .select({ id: user.id, mu: user.mu, sigma: user.sigma })
    .from(user)
    .where(inArray(user.id, userIds))

  if (existing.length !== userIds.length) {
    // Should never fire — every connected player has a Better Auth session
    // (no guest play), and a session implies a `user` row. Surface loudly so
    // the upstream identity invariant is fixed at the source, not papered over.
    const found = new Set(existing.map((u) => u.id))
    const missing = userIds.filter((id) => !found.has(id))
    throw new Error(
      `persistMatchResult: missing user rows for ${missing.join(', ')}`,
    )
  }

  const ratingByUserId = new Map<string, { mu: number; sigma: number }>(
    existing.map((u) => [u.id, { mu: u.mu, sigma: u.sigma }]),
  )

  const winner = finalState.seats.find((s) => s.isAlive)
  if (!winner) {
    throw new Error('persistMatchResult: no alive seat at GAME_OVER')
  }

  // True N-way ranking from elimination order (SKILL.md § 3.6 / § 4.8).
  const positions = computeFinishingPositions(finalState)
  const finishingPositionOf = (playerId: string): number => {
    const position = positions.get(playerId)
    if (position === undefined) {
      // Defensive — computeFinishingPositions covers every seat.
      throw new Error(`persistMatchResult: no finishing position for "${playerId}"`)
    }
    return position
  }

  const seatResults: SeatResult[] = finalState.seats.map((seat) => {
    const rating = ratingByUserId.get(seat.playerId)
    if (!rating) {
      // Defensive — the existence check above should have caught this.
      throw new Error(`persistMatchResult: no rating for "${seat.playerId}"`)
    }
    return {
      playerId: seat.playerId,
      mu: rating.mu,
      sigma: rating.sigma,
      finishingPosition: finishingPositionOf(seat.playerId),
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
      finishingPosition: finishingPositionOf(seat.playerId),
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
