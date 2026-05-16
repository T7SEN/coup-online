import type { MatchId, PlayerId } from '@coup-online/protocol'
import { DECK, drawFromDeck, randomIntBelow, shuffle } from './deck'
import type { GameState, ServerSeat } from './state'

// Minimum and maximum player count. SKILL.md § 1 — 3-6 players per match.
// TEMP(2-player testing): MIN_PLAYERS lowered 3 → 2 for local testing so a
// 2-player match can start. Revert to 3 before release —
// grep "TEMP(2-player testing)" for every site that must move back.
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

// Starting resources per player. SKILL.md § 4.2.
export const STARTING_COINS = 2
export const STARTING_INFLUENCE = 2

// Input shape for dealInitialState. Caller is responsible for ensuring playerIds
// are unique and authenticated upstream.
export interface SeatInput {
  readonly playerId: PlayerId
  readonly displayName: string
}

// Build the initial GameState for a fresh match.
//   - Validates 3-6 players (SKILL.md § 1).
//   - Shuffles the 15-card DECK once (SKILL.md § 4.2).
//   - Deals 2 face-down cards to each player in seat order.
//   - Each player starts with 2 coins.
//   - Random first turn (SKILL.md § 4.2). Seat order = caller's join order, immutable.
//   - Initial phase = AWAITING_ACTION (SKILL.md § 3.2).
export function dealInitialState(matchId: MatchId, players: readonly SeatInput[]): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(
      `dealInitialState: Coup requires ${MIN_PLAYERS}-${MAX_PLAYERS} players (got ${players.length})`,
    )
  }

  const courtDeck = shuffle(DECK)
  const seats: ServerSeat[] = players.map((p) => {
    const dealt = drawFromDeck(courtDeck, STARTING_INFLUENCE)
    return {
      playerId: p.playerId,
      displayName: p.displayName,
      coins: STARTING_COINS,
      isAlive: true,
      isDisconnected: false,
      influence: dealt.map((kind) => ({ status: 'face-down' as const, kind })),
      eliminationOrder: null,
    }
  })

  return {
    matchId,
    phase: 'AWAITING_ACTION',
    turnIndex: randomIntBelow(players.length),
    seats,
    courtDeck,
    pendingAction: null,
    pendingBlock: null,
    timerEndsAt: null,
    influenceLossQueue: [],
    exchangePool: null,
  }
}
