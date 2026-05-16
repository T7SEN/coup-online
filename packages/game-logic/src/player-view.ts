import type { Influence, PlayerId, PlayerSeat, PlayerView } from '@coup-online/protocol'
import type { GameState, ServerInfluence } from './state'

// Thrown when buildPlayerView is asked to slice a view for a player who is not
// seated in the match. Defense-in-depth: the DO must only invoke this for live,
// authenticated connections bound to a seat — but if something upstream slips,
// we fail loud here rather than synthesize a fake view that could leak info.
export class UnknownPlayerError extends Error {
  constructor(playerId: PlayerId) {
    super(`buildPlayerView: playerId "${playerId}" is not seated in this match`)
    this.name = 'UnknownPlayerError'
  }
}

// Slice the canonical server-side GameState into a per-recipient view.
// SKILL.md § 3.1, § 5 — single canonical entry point for slicing. Never broadcast
// raw GameState; never inline the slicing logic. Every state mutation that triggers
// a broadcast routes through this function so the hidden-information invariant lives
// in exactly one place.
export function buildPlayerView(state: GameState, viewerId: PlayerId): PlayerView {
  if (!state.seats.some((s) => s.playerId === viewerId)) {
    throw new UnknownPlayerError(viewerId)
  }

  const seats: PlayerSeat[] = state.seats.map((s) => {
    const isMe = s.playerId === viewerId
    return {
      playerId: s.playerId,
      displayName: s.displayName,
      coins: s.coins,
      isMe,
      isAlive: s.isAlive,
      isDisconnected: s.isDisconnected,
      influence: s.influence.map((inf) => sliceInfluence(inf, isMe)),
      // ?? null guards a GameState rehydrated from before this field existed.
      eliminationOrder: s.eliminationOrder ?? null,
    }
  })

  return {
    matchId: state.matchId,
    myPlayerId: viewerId,
    phase: state.phase,
    turnPlayerId: state.seats[state.turnIndex].playerId,
    seats,
    courtDeck: { count: state.courtDeck.length },
    pendingAction: state.pendingAction,
    pendingBlock: state.pendingBlock,
    timerEndsAt: state.timerEndsAt,
    // Head of the queue (current picker), or null when empty. Public so clients
    // can gate the InfluencePickBar to the right player without leaking other
    // hidden state. SKILL.md § 3.1 — no card identities here, only the playerId.
    influenceLossPlayerId: state.influenceLossQueue[0] ?? null,
  }
}

// Per-card slicing. The hidden-info enforcement lives here.
// SKILL.md § 3.1 — face-down cards belonging to OTHER players MUST be opaque to
// the viewer; the card identity is never serialized in the output.
function sliceInfluence(inf: ServerInfluence, isSelf: boolean): Influence {
  if (inf.status === 'revealed') {
    // Already public knowledge (face-up since the player lost it).
    return { status: 'revealed', kind: inf.kind }
  }
  // inf.status === 'face-down'
  if (isSelf) {
    // The viewer is allowed to see their own hand.
    return { status: 'face-down', kind: inf.kind }
  }
  // Someone else's face-down card. Strip the kind — viewer must not learn it.
  return { status: 'hidden' }
}
