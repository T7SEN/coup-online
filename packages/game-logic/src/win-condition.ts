import type { PlayerId } from '@coup-online/protocol'
import type { GameState } from './state'

// SKILL.md § 4.8 — last player with at least one face-down card wins. The game
// ends immediately upon elimination of the second-to-last player.
// Returns the winner's playerId, or null if the game is still in progress.
// 0 alive seats shouldn't occur (the second-to-last elimination leaves exactly
// one survivor), but we return null defensively rather than throwing.
export function checkWinner(state: GameState): PlayerId | null {
  const aliveSeats = state.seats.filter((s) => s.isAlive)
  if (aliveSeats.length === 1) {
    return aliveSeats[0].playerId
  }
  return null
}

// Map each seat's playerId to its 1-based finishing position (1 = winner).
// SKILL.md § 3.6 / § 4.8 — finishing position is the reverse of elimination
// order: the last player eliminated places highest among the eliminated.
//
//   - Survivors (eliminationOrder == null) → position 1.
//   - Eliminated seats are ranked by eliminationOrder DESCENDING — the
//     latest-eliminated takes the best non-winning slot. With one survivor and
//     N seats this yields the distinct positions 1..N.
//
// Intended to be called at GAME_OVER, where exactly one seat survives. If it is
// ever called mid-game (multiple survivors) every survivor ties at position 1 —
// deterministic, but only the GAME_OVER result is meaningful. The caller
// (persistMatchResult) feeds these into TrueSkill, which ranks the match.
export function computeFinishingPositions(state: GameState): Map<PlayerId, number> {
  const positions = new Map<PlayerId, number>()

  const survivors = state.seats.filter((s) => s.eliminationOrder == null)
  for (const seat of survivors) {
    positions.set(seat.playerId, 1)
  }

  const eliminated = state.seats
    .filter((s) => s.eliminationOrder != null)
    .sort((a, b) => (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0))
  let position = survivors.length + 1
  for (const seat of eliminated) {
    positions.set(seat.playerId, position)
    position += 1
  }

  return positions
}
