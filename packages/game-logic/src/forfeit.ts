import type { PlayerId } from '@coup-online/protocol'
import {
  applyActionEffect,
  concludeTurn,
  IllegalActionError,
  nextEliminationOrder,
} from './actions'
import { returnToDeckAndShuffle } from './deck'
import type { GameState, PendingAction } from './state'
import { checkWinner } from './win-condition'

// SKILL.md § 3.5 — forfeit-on-disconnect. Server calls this after the 30s
// grace period elapses with no reconnect (the alarm in apps/game-server's
// GameRoom DO).
//
// Effect:
//   1. All of the player's face-down cards flip to `revealed`. They go !isAlive
//      and get an eliminationOrder stamp, exactly like a normal elimination.
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
  // A forfeit is an elimination — stamp the finishing order like any other.
  seat.eliminationOrder = nextEliminationOrder(state)

  state.influenceLossQueue = state.influenceLossQueue.filter((id) => id !== playerId)

  if (state.exchangePool && state.exchangePool.actorPlayerId === playerId) {
    returnToDeckAndShuffle(state.courtDeck, state.exchangePool.cards)
    state.exchangePool = null
  }

  // A blockable action whose blocker forfeits is resolved as if no block was
  // declared, rather than canceling the actor's turn (v1 audit, Finding B).
  // The dead-target guard in applyActionEffect makes Steal / Assassinate fizzle
  // — their blocker IS the target and is now eliminated — while Foreign Aid
  // resolves (+2 to the actor, the sole objector having left).
  let actionToResolve: PendingAction | null = null
  if (state.pendingAction && state.pendingAction.actorPlayerId === playerId) {
    // The actor abandoned their own action — the whole interaction evaporates.
    state.pendingAction = null
    state.pendingBlock = null
    state.blockWindowPending = false
  } else if (state.pendingBlock && state.pendingBlock.blockerPlayerId === playerId) {
    actionToResolve = state.pendingAction
    state.pendingBlock = null
    state.pendingAction = null
  }
  if (actionToResolve) {
    applyActionEffect(state, actionToResolve.action, actionToResolve.actorPlayerId)
  }

  if (state.influenceLossQueue.length > 0) {
    state.phase = 'INFLUENCE_LOSS'
    return state
  }
  // If this forfeit decided the game, end it — a deferred block window or
  // exchange is moot once only one player remains (SKILL.md § 4.8).
  if (checkWinner(state)) {
    return concludeTurn(state)
  }
  // per SKILL.md § 3.2 phase 3 — a proven challenge of a blockable action
  // resumes at BLOCK_WINDOW once influence losses clear, even if the only
  // queued picker forfeited.
  if (state.blockWindowPending) {
    state.blockWindowPending = false
    state.phase = 'BLOCK_WINDOW'
    return state
  }
  if (state.exchangePool) {
    state.phase = 'EXCHANGE_SELECTION'
    return state
  }

  return concludeTurn(state)
}
