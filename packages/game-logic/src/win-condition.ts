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
