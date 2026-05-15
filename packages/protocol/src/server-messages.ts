import { z } from 'zod'
import { CardKind, MatchId, PlayerId } from './domain'
import { PlayerView } from './player-view'

// Server → Client private prompts. Each is sent to a single connection, never broadcast.
// These payloads contain card identities and would leak hidden information if broadcast.
export const Prompt = z.discriminatedUnion('kind', [
  // Influence-loss prompt: the losing player picks which of their 2 face-down cards
  // to reveal. SKILL.md § 3.2 phase 6 / § 4.7 — strictly private to the prompted player.
  z.object({
    kind: z.literal('influence-pick'),
    cards: z.array(CardKind).length(2),
  }),

  // Ambassador exchange prompt: the Ambassador player sees their 2 cards plus 2 drawn
  // from the Court Deck. SKILL.md § 3.2 phase 7 — strictly private. Indices in the
  // returned `exchange-pick` message refer to this 4-card pool.
  z.object({
    kind: z.literal('exchange-pick'),
    cards: z.array(CardKind).length(4),
  }),
])
export type Prompt = z.infer<typeof Prompt>

// Outbound to a single client. Like inbound, validated against this schema before send
// (SKILL.md § 5 — Zod-validate every WS message at the DO boundary, both directions).
export const ServerMessage = z.discriminatedUnion('type', [
  // Pre-game lobby update. Sent while phase is LOBBY (before the host presses
  // Start). Replaced by `state-update` once dealInitialState fires. `canStart`
  // is true iff the current lobby size is within the legal start range
  // (SKILL.md § 1 — 3-6 players); clients enable the Start button on this flag.
  // `hostPlayerId` identifies the lobby host (first joiner, auto-transferred
  // on host-leave). Only the host may press Start or Kick.
  z.object({
    type: z.literal('lobby-update'),
    matchId: MatchId,
    hostPlayerId: PlayerId,
    players: z.array(
      z.object({
        playerId: PlayerId,
        displayName: z.string(),
      }),
    ),
    minPlayersToStart: z.number().int().positive(),
    maxPlayers: z.number().int().positive(),
    canStart: z.boolean(),
  }),

  // Per-recipient sliced state. Build via buildPlayerView(state, playerId).
  // SKILL.md § 3.1 — never inline the slicing; never broadcast raw GameState.
  z.object({ type: z.literal('state-update'), view: PlayerView }),

  // Private prompt requesting input from this specific player.
  z.object({ type: z.literal('prompt'), prompt: Prompt }),

  // Error response (illegal action, phase mismatch, validation failure, etc.).
  z.object({
    type: z.literal('error'),
    code: z.string().min(1),
    message: z.string(),
  }),

  // Match has ended. Winner is the last player with at least one face-down card.
  // SKILL.md § 4.8. `finalView` is the post-game state — losing players' face-up cards
  // are now public.
  z.object({
    type: z.literal('game-end'),
    winnerPlayerId: PlayerId,
    finalView: PlayerView,
  }),

  // Lobby chat broadcast. Server stamps `fromPlayerId` from the authenticated connection.
  z.object({
    type: z.literal('chat'),
    fromPlayerId: PlayerId,
    text: z.string(),
  }),

  // Per-connection rate cap exceeded. SKILL.md § 5 — 30 messages per 5-second window;
  // excess dropped server-side; this notification is sent ONLY to the offending connection.
  z.object({
    type: z.literal('rate-limit'),
    retryAfterMs: z.number().int().positive(),
  }),
])
export type ServerMessage = z.infer<typeof ServerMessage>
