// SKILL.md § 3.6 — TrueSkill defaults pinned for this project.
//   - INITIAL_MU / INITIAL_SIGMA: starting rating for a fresh account.
//   - BETA: distance that guarantees ~76% chance of winning.
//   - TAU: dynamic factor; small additive noise on sigma between matches.
//   - DRAW_PROBABILITY: Coup has no draws (last face-down card wins outright).

export const INITIAL_MU = 25
export const INITIAL_SIGMA = 25 / 3
export const BETA = 25 / 6
export const TAU = 25 / 300
export const DRAW_PROBABILITY = 0
