import { z } from 'zod'

// The 5 base-game characters. SKILL.md § 4.1 — deck is exactly 15 cards: 3 each.
// Never add Inquisitor / Bureaucrat / Jester / Speculator / Socialist / Anarchist — expansion
// characters are out of v1 scope (SKILL.md § 0 step 1, § 1 banned features).
export const CardKind = z.enum(['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'])
export type CardKind = z.infer<typeof CardKind>

// The 7 actions. SKILL.md § 4.3 (general) + § 4.4 (character).
// Income / ForeignAid / Coup are general — no character claim required.
// Tax / Assassinate / Steal / Exchange are character claims and are challengeable.
export const ActionKind = z.enum([
  'Income',
  'ForeignAid',
  'Coup',
  'Tax',
  'Assassinate',
  'Steal',
  'Exchange',
])
export type ActionKind = z.infer<typeof ActionKind>

// Characters that may legally block actions. SKILL.md § 4.5.
// Duke blocks ForeignAid. Contessa blocks Assassinate. Captain + Ambassador block Steal.
export const BlockerCharacter = z.enum(['Duke', 'Contessa', 'Captain', 'Ambassador'])
export type BlockerCharacter = z.infer<typeof BlockerCharacter>

// Player ID — server-assigned. UUIDs from crypto.randomUUID() per SKILL.md § 5.
// Kept as plain string for now; brand later with z.string().brand<'PlayerId'>() if needed.
export const PlayerId = z.string().min(1)
export type PlayerId = z.infer<typeof PlayerId>

// Match ID — server-assigned UUID. Same brand note as PlayerId.
export const MatchId = z.string().min(1)
export type MatchId = z.infer<typeof MatchId>

// Action payload as declared by the acting player.
// Targeted actions (Coup, Assassinate, Steal) must specify the target player.
// per SKILL.md § 4.3 + § 4.4.
export const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('Income') }),
  z.object({ kind: z.literal('ForeignAid') }),
  z.object({ kind: z.literal('Coup'), targetPlayerId: PlayerId }),
  z.object({ kind: z.literal('Tax') }),
  z.object({ kind: z.literal('Assassinate'), targetPlayerId: PlayerId }),
  z.object({ kind: z.literal('Steal'), targetPlayerId: PlayerId }),
  z.object({ kind: z.literal('Exchange') }),
])
export type Action = z.infer<typeof Action>

// Game state-machine phases. SKILL.md § 3.2.
// Server is the only entity that advances phases. Action handlers MUST phase-guard
// as their first check (SKILL.md § 5).
export const Phase = z.enum([
  'AWAITING_ACTION',
  'CHALLENGE_WINDOW',
  'CHALLENGE_RESOLUTION',
  'BLOCK_WINDOW',
  'BLOCK_CHALLENGE_WINDOW',
  'INFLUENCE_LOSS',
  'EXCHANGE_SELECTION',
  'TURN_END',
  'GAME_OVER',
])
export type Phase = z.infer<typeof Phase>
