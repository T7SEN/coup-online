import type { PlayerId } from '@coup-online/protocol'
import { concludeTurn, IllegalActionError } from './actions'
import { returnToDeckAndShuffle } from './deck'
import type { GameState } from './state'

// SKILL.md § 3.5 — forfeit-on-disconnect. Server calls this after the 30s
// grace period elapses with no reconnect (the alarm in apps/game-server's
// GameRoom DO).
//
// Effect:
//   1. All of the player's face-down cards flip to `revealed`. They go !isAlive.
//   2. Any state that references this player as the active actor is cleared:
//        - influenceLossQueue: entries for this player are removed
//        - exchangePool: if they were the actor, both drawn cards are returned
//          to the Court Deck (which is reshuffled — SKILL.md § 4.6 anonymity).
//        - pendingAction: if they were the actor, the entire pending interaction
//          (action + block) evaporates.
//        - pendingBlock: if they were the blocker, the block evaporates AND the
//          parent action is canceled too. Conservative v1 choice: the actor
//          loses their turn. A more nuanced "resolve action as if no block was
//          declared" rule is a future pass.
//   3. Phase transitions:
//        - If influenceLossQueue still has pending pickers → INFLUENCE_LOSS
//        - Else if exchangePool still set (forfeitee wasn't the actor)
//          → EXCHANGE_SELECTION
//        - Else → concludeTurn (advances to next living seat, or flips to
//          GAME_OVER if this forfeit eliminated the second-to-last player).
//
// Idempotent — calling on an already-eliminated seat is a no-op.
export function forfeitPlayer(state: GameState, playerId: PlayerId): GameState {
  const seat = state.seats.find((s) => s.playerId === playerId)
  if (!seat) {
    throw new IllegalActionError(
      'unknown_player',
      `Player "${playerId}" is not seated in this match`,
    )
  }
  if (!seat.isAlive) return state

  seat.influence = seat.influence.map((inf) =>
    inf.status === 'face-down' ? { status: 'revealed', kind: inf.kind } : inf,
  )
  seat.isAlive = false
  seat.isDisconnected = true

  state.influenceLossQueue = state.influenceLossQueue.filter((id) => id !== playerId)

  if (state.exchangePool && state.exchangePool.actorPlayerId === playerId) {
    returnToDeckAndShuffle(state.courtDeck, state.exchangePool.cards)
    state.exchangePool = null
  }

  if (state.pendingAction && state.pendingAction.actorPlayerId === playerId) {
    state.pendingAction = null
    state.pendingBlock = null
  }
  if (state.pendingBlock && state.pendingBlock.blockerPlayerId === playerId) {
    state.pendingBlock = null
    state.pendingAction = null
  }

  if (state.influenceLossQueue.length > 0) {
    state.phase = 'INFLUENCE_LOSS'
    return state
  }
  if (state.exchangePool) {
    state.phase = 'EXCHANGE_SELECTION'
    return state
  }

  return concludeTurn(state)
}
