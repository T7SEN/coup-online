import { z } from 'zod'
import { Action, BlockerCharacter } from './domain'

// Inbound from the client. ALL inbound messages MUST be Zod-validated at the DO
// boundary (SKILL.md § 5). Clients can send arbitrary bytes — never trust them.
export const ClientMessage = z.discriminatedUnion('type', [
  // Declare an action on your turn. Server enforces turn ownership, coin sufficiency,
  // mandatory-Coup at >=10 coins (SKILL.md § 4.9), and target validity.
  z.object({ type: z.literal('action'), action: Action }),

  // Challenge the latest pending character claim. SKILL.md § 3.2 — applies to the
  // current window (CHALLENGE_WINDOW or BLOCK_CHALLENGE_WINDOW); the server disambiguates
  // by phase. First server-received challenge wins; later challenges in the same window
  // are silently dropped (race tie-break by DO Date.now()).
  z.object({ type: z.literal('challenge') }),

  // Declare a block by claiming a blocker character. SKILL.md § 4.5.
  z.object({ type: z.literal('block'), claimedCharacter: BlockerCharacter }),

  // Explicitly decline to block (otherwise the BLOCK_WINDOW resolves on timer expiry).
  z.object({ type: z.literal('pass-block') }),

  // Pick which of your 2 face-down cards to reveal when losing influence.
  // SKILL.md § 4.7 — timeout auto-picks the leftmost face-down card.
  z.object({
    type: z.literal('influence-pick'),
    cardIndex: z.number().int().min(0).max(1),
  }),

  // Ambassador exchange: indices (0-3) into the 4-card pool (your 2 + 2 drawn from Court
  // Deck) that you want to keep. Length exactly 2. SKILL.md § 3.2 phase 7 — server
  // validates the kept 2 are a valid subset of the 4 it offered.
  z.object({
    type: z.literal('exchange-pick'),
    keepIndices: z.array(z.number().int().min(0).max(3)).length(2),
  }),

  // Lobby chat. SKILL.md § 1 — chat is lobby-only; server MUST reject chat messages
  // when the match is active. Soft 500-char cap.
  z.object({
    type: z.literal('chat'),
    text: z.string().min(1).max(500),
  }),
])
export type ClientMessage = z.infer<typeof ClientMessage>
