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
}
