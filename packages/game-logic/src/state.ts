import type {
  Action,
  BlockerCharacter,
  CardKind,
  MatchId,
  PendingAction,
  PendingBlock,
  Phase,
  PlayerId,
} from '@coup-online/protocol'

// One card in a player's influence pile as the SERVER sees it.
// Different from `Influence` in the protocol package:
//   - Server always knows the `kind` (it's the source of truth).
//   - No `hidden` variant — that's a slicing artifact for per-recipient views only.
// SKILL.md § 3.1 — never let this leak; ship `PlayerView` to clients instead.
export type ServerInfluence =
  | { readonly status: 'face-down'; readonly kind: CardKind }
  | { readonly status: 'revealed'; readonly kind: CardKind }

// One seat on the server side. Has the actual cards plus tracking flags the
// PlayerSeat slice doesn't expose to other players.
export interface ServerSeat {
  readonly playerId: PlayerId
  readonly displayName: string
  coins: number
  isAlive: boolean
  isDisconnected: boolean
  influence: ServerInfluence[] // length 2 at start; cards flip face-up when lost
  // 1-based ordinal of the seat's elimination: the first player knocked out is
  // 1, the second 2, etc. `null` while the seat is still alive. Assigned exactly
  // once, at the moment the seat goes !isAlive (applyInfluencePick / forfeitPlayer).
  // Drives true finishing-position ranking for TrueSkill — see
  // computeFinishingPositions() in win-condition.ts.
  eliminationOrder: number | null
}

// Re-export the BlockerCharacter type for convenience — pending-block uses it
// and consumers of state.ts often want both together.
export type { BlockerCharacter, Action, PendingAction, PendingBlock }

// The canonical server-side game state, stored in the GameRoom DO's SQLite storage.
// Build a per-recipient PlayerView from this via buildPlayerView() before broadcasting
// (SKILL.md § 3.1) — never serialize GameState to any client.
export interface GameState {
  readonly matchId: MatchId
  phase: Phase
  // Index into `seats` of the player whose turn it is. Advances on TURN_END.
  turnIndex: number
  seats: ServerSeat[]
  // Face-down draw pile. SKILL.md § 4.1 — composition invariant: tracked face-up
  // cards (lost) + tracked face-down cards (in hands) + courtDeck must always equal
  // the 15-card multiset.
  courtDeck: CardKind[]
  pendingAction: PendingAction | null
  pendingBlock: PendingBlock | null
  // Unix ms; null when no timer is running for the current phase.
  timerEndsAt: number | null
  // FIFO queue of players who must respond to INFLUENCE_LOSS prompts. The head
  // is the current picker; after their pick resolves, the head is removed and
  // the next player (if any) becomes the picker. A queue rather than a single
  // field because Assassinate's disproven-block path enqueues TWO losses for
  // the same player (one from failed block challenge, one from the Assassinate
  // resolving). Cleared by concludeTurn(). Internal to game-logic; not exposed
  // in PlayerView yet — surface through the protocol when client UI needs it.
  influenceLossQueue: PlayerId[]
  // The Ambassador exchange pool: the actor's face-down cards plus the 2 newly
  // drawn from the Court Deck. Non-null only when phase === 'EXCHANGE_SELECTION'.
  // SKILL.md § 3.2 phase 7 — strictly private to the actor; the DO sends the
  // contents via a `prompt` message and never to other players. Cleared on
  // exchange-pick resolution (and by concludeTurn defensively).
  exchangePool: { readonly actorPlayerId: PlayerId; cards: CardKind[] } | null
}
