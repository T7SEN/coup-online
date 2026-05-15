import { Rating, TrueSkill } from 'ts-trueskill'
import { BETA, DRAW_PROBABILITY, TAU } from './constants'
import type { RatingDelta, SeatResult } from './types'

// Build a TrueSkill environment with project-pinned beta / tau / drawProbability.
// mu / sigma are left at the library defaults — we don't use env.createRating();
// the caller supplies per-player Rating objects explicitly so per-account state
// can be carried in.
function createEnv(): TrueSkill {
  return new TrueSkill(undefined, undefined, BETA, TAU, DRAW_PROBABILITY)
}

// SKILL.md § 3.6 — rate a finished N-player free-for-all match.
// TrueSkill natively models multi-team rating; for free-for-all, each player is
// a single-player "team". `finishingPosition` is 1-indexed (1 = winner); we
// subtract 1 to produce the 0-indexed `ranks` array TrueSkill expects (lower =
// better).
//
// Returns one RatingDelta per input seat, in the same order. Caller persists
// these (e.g., updates `users.mu` / `users.sigma` and writes one `mmr_history`
// row per player) as the last step of endGame() (SKILL.md § 5).
export function rateMatch(seats: readonly SeatResult[]): RatingDelta[] {
  if (seats.length < 2) {
    throw new Error(`rateMatch: at least 2 seats required (got ${seats.length})`)
  }
  for (const s of seats) {
    if (!Number.isFinite(s.mu) || !Number.isFinite(s.sigma) || s.sigma <= 0) {
      throw new Error(
        `rateMatch: invalid rating for "${s.playerId}" (mu=${s.mu}, sigma=${s.sigma})`,
      )
    }
    if (!Number.isInteger(s.finishingPosition) || s.finishingPosition < 1) {
      throw new Error(
        `rateMatch: finishingPosition must be a positive integer (got ${s.finishingPosition} for "${s.playerId}")`,
      )
    }
  }

  const env = createEnv()
  const ratingGroups: Rating[][] = seats.map((s) => [new Rating(s.mu, s.sigma)])
  const ranks: number[] = seats.map((s) => s.finishingPosition - 1)
  const updated = env.rate(ratingGroups, ranks) as Rating[][]

  return seats.map((s, i) => {
    const after = updated[i][0]
    return {
      playerId: s.playerId,
      muBefore: s.mu,
      sigmaBefore: s.sigma,
      muAfter: after.mu,
      sigmaAfter: after.sigma,
    }
  })
}
