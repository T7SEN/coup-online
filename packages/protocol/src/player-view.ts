import { z } from 'zod'
import { Action, BlockerCharacter, CardKind, MatchId, Phase, PlayerId } from './domain'

// One card in a player's influence pile, as observed by a specific viewer.
// SKILL.md § 3.1 — strict hidden-information rules:
//   • `hidden`     — face-down card belonging to ANOTHER player. The viewer never learns
//                    its identity until it's revealed (lost).
//   • `face-down`  — face-down card belonging to the VIEWER. The viewer sees their own hand.
//   • `revealed`   — face-up card (already lost). Public knowledge to everyone.
// `kind` is never present on `hidden` — that's the whole point of slicing per-viewer.
export const Influence = z.discriminatedUnion('status', [
  z.object({ status: z.literal('hidden') }),
  z.object({ status: z.literal('face-down'), kind: CardKind }),
  z.object({ status: z.literal('revealed'), kind: CardKind }),
])
export type Influence = z.infer<typeof Influence>

// One seat at the table as observed by the viewer.
// `isMe` lets the client UI fast-path its own seat. `coins` and `isAlive` are always public
// (SKILL.md § 3.1 — face-up state is public). Display name has a soft 40-char ceiling
// (not specified in SKILL.md; adjust if needed).
export const PlayerSeat = z.object({
  playerId: PlayerId,
  displayName: z.string().min(1).max(40),
  coins: z.number().int().nonnegative(),
  isMe: z.boolean(),
  isAlive: z.boolean(),
  isDisconnected: z.boolean(),
  influence: z.array(Influence).length(2),
  // 1-based ordinal of when this seat was eliminated (1 = first out), or null
  // while alive. Public — elimination is observable to everyone (SKILL.md § 3.1).
  // The client renders final standings from this; finishing position is the
  // reverse of elimination order.
  eliminationOrder: z.number().int().positive().nullable(),
})
export type PlayerSeat = z.infer<typeof PlayerSeat>

// The action currently in flight (declared, awaiting challenge / block / resolution).
// Null when phase is AWAITING_ACTION (nothing has been declared yet) or TURN_END/GAME_OVER.
export const PendingAction = z.object({
  actorPlayerId: PlayerId,
  action: Action,
})
export type PendingAction = z.infer<typeof PendingAction>

// A block claim awaiting challenge or resolution. Non-null only during BLOCK_WINDOW
// (after a player declares) and BLOCK_CHALLENGE_WINDOW.
export const PendingBlock = z.object({
  blockerPlayerId: PlayerId,
  claimedCharacter: BlockerCharacter,
})
export type PendingBlock = z.infer<typeof PendingBlock>

// The per-recipient sliced game state. SKILL.md § 3.1.
// NEVER broadcast raw GameState — build via buildPlayerView(state, playerId) per recipient.
// 3-6 seats per SKILL.md § 1. Court Deck is exposed as { count } only — never the cards.
export const PlayerView = z.object({
  matchId: MatchId,
  myPlayerId: PlayerId,
  phase: Phase,
  turnPlayerId: PlayerId,
  // TEMP(2-player testing): min lowered 3 → 2 so a 2-seat game's state-update
  // passes validation. Revert to .min(3) before release (SKILL.md § 1).
  seats: z.array(PlayerSeat).min(2).max(6),
  courtDeck: z.object({ count: z.number().int().nonnegative() }),
  pendingAction: PendingAction.nullable(),
  pendingBlock: PendingBlock.nullable(),
  // Server-authoritative timer deadline (unix ms). Client renders countdown locally.
  // Null when no timer is active (e.g., INFLUENCE_LOSS-by-other-player, GAME_OVER).
  timerEndsAt: z.number().int().nonnegative().nullable(),
  // Head of the server's influenceLossQueue, or null when the queue is empty.
  // Exposed so clients only render the InfluencePickBar to the player who is
  // actually being asked to pick — avoids server-rejected `not_your_pick`
  // errors from non-picker clicks. SKILL.md § 4.7.
  influenceLossPlayerId: PlayerId.nullable(),
})
export type PlayerView = z.infer<typeof PlayerView>
