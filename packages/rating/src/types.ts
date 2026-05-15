// Input shape for rateMatch — one entry per seat at game end.
// `finishingPosition` is 1-indexed and human-friendly: 1 = winner, 2 = runner-up,
// etc. The wrapper converts to TrueSkill's 0-indexed rank internally.
//
// `mu` and `sigma` are the player's pre-match values; the caller pulls these
// from the players' persisted ratings (D1's `users` or `mmr_history`).
export interface SeatResult {
  readonly playerId: string
  readonly mu: number
  readonly sigma: number
  readonly finishingPosition: number
}

// Output shape — one entry per seat, in the same order as input. Includes both
// before-values (passthrough) and after-values (TrueSkill-computed) so the
// caller can write the `mmr_history` row in one shot.
export interface RatingDelta {
  readonly playerId: string
  readonly muBefore: number
  readonly sigmaBefore: number
  readonly muAfter: number
  readonly sigmaAfter: number
}
