# State Machine — Implementation Reference

Companion to SKILL.md § 3.2 / § 4. Documents the concrete state machine implemented
in `packages/game-logic/`. SKILL.md is the spec; this file is the spec made literal.

## GameState shape

Defined in `packages/game-logic/src/state.ts`:

| Field | Type | Notes |
|---|---|---|
| `matchId` | `MatchId` (readonly) | Server-generated UUID |
| `phase` | `Phase` | One of 9 phases below |
| `turnIndex` | `number` | Index into `seats` of current actor |
| `seats` | `ServerSeat[]` | 3-6 entries; immutable order |
| `courtDeck` | `CardKind[]` | Face-down draw pile |
| `pendingAction` | `PendingAction \| null` | Set during action lifecycle, cleared on resolution |
| `pendingBlock` | `PendingBlock \| null` | Set during BLOCK_CHALLENGE_WINDOW |
| `timerEndsAt` | `number \| null` | Unix ms; set by DO, not by game-logic |
| `influenceLossQueue` | `PlayerId[]` | FIFO queue; head is current INFLUENCE_LOSS picker |
| `exchangePool` | `{ actorPlayerId, cards: CardKind[] } \| null` | 4-card pool during EXCHANGE_SELECTION |

`ServerInfluence` is `{ status: 'face-down' \| 'revealed', kind: CardKind }`. The
`hidden` variant is a slicing artifact in `Influence` (protocol) and never appears
in `ServerInfluence`.

## Phases

| Phase | When | What can happen |
|---|---|---|
| `AWAITING_ACTION` | Idle, waiting for current player to act | One of 7 action handlers |
| `CHALLENGE_WINDOW` | Character claim made (Tax/Steal/Assassinate/Exchange) | `applyChallenge` or `applyChallengeWindowTimeout` |
| `CHALLENGE_RESOLUTION` | Transient — resolution server-instant | Not externally observable |
| `BLOCK_WINDOW` | Blockable action awaiting block (ForeignAid; Steal/Assassinate after CHALLENGE_WINDOW timeout) | `applyBlock` or `applyBlockWindowTimeout` |
| `BLOCK_CHALLENGE_WINDOW` | Block claim made | `applyChallenge` (block challenge) or `applyBlockChallengeWindowTimeout` |
| `INFLUENCE_LOSS` | Queue head must pick a card | `applyInfluencePick` or `applyInfluenceTimeout` |
| `EXCHANGE_SELECTION` | Ambassador exchange pool exposed to actor | `applyExchangePick` or `applyExchangeTimeout` |
| `TURN_END` | Logical — server-instant, not externally observable | Win check + turn advance |
| `GAME_OVER` | Only one player alive | Terminal |

## Action lifecycle by action

### Income — SKILL.md § 4.3
```
AWAITING_ACTION → [applyIncome] → +1 coin → concludeTurn → AWAITING_ACTION (next player) or GAME_OVER
```

### Coup — SKILL.md § 4.3
```
AWAITING_ACTION → [applyCoup] → -7 coins → INFLUENCE_LOSS (target picks)
INFLUENCE_LOSS → [applyInfluencePick] → concludeTurn
```

### ForeignAid — SKILL.md § 4.3 / § 4.5
```
AWAITING_ACTION → [applyForeignAid] → BLOCK_WINDOW
BLOCK_WINDOW + timer expires → [applyBlockWindowTimeout] → +2 coins → concludeTurn
BLOCK_WINDOW + Duke claim → [applyBlock] → BLOCK_CHALLENGE_WINDOW
  ├── timer expires → [applyBlockChallengeWindowTimeout] → action canceled → concludeTurn
  └── challenge → [applyChallenge] (block-challenge variant)
       ├── proven (blocker has Duke) → swap card → challenger picks → concludeTurn
       └── disproven (bluff) → +2 coins to actor → blocker picks → concludeTurn
```

### Tax — SKILL.md § 4.4 (Duke)
```
AWAITING_ACTION → [applyTax] → CHALLENGE_WINDOW
CHALLENGE_WINDOW + timer expires → [applyChallengeWindowTimeout] → +3 coins → concludeTurn
CHALLENGE_WINDOW + challenge → [applyChallenge] (action-challenge variant)
  ├── proven (actor has Duke) → swap card → +3 coins → challenger picks → concludeTurn
  └── disproven (bluff) → claimant picks → concludeTurn (no coins)
```

### Steal — SKILL.md § 4.4 (Captain)
```
AWAITING_ACTION → [applyStealAction] → CHALLENGE_WINDOW
CHALLENGE_WINDOW + timer expires → [applyChallengeWindowTimeout] → BLOCK_WINDOW
BLOCK_WINDOW + timer expires → [applyBlockWindowTimeout] → transfer min(2, target.coins) → concludeTurn
BLOCK_WINDOW + target claims Captain or Ambassador → [applyBlock] → BLOCK_CHALLENGE_WINDOW
  ├── timer expires → action canceled → concludeTurn
  ├── challenge proven → swap card → challenger picks → concludeTurn (no transfer)
  └── challenge disproven → transfer happens → blocker picks → concludeTurn
CHALLENGE_WINDOW + challenge → as Tax above, but:
  ├── proven → swap card → transfer → challenger picks → concludeTurn
  └── disproven → claimant picks → concludeTurn
```

Only the **target** can block Steal.

### Assassinate — SKILL.md § 4.4 (Assassin)
```
AWAITING_ACTION → [applyAssassinate] → -3 coins (PAID AT DECLARATION) → CHALLENGE_WINDOW
CHALLENGE_WINDOW + timer expires → BLOCK_WINDOW
BLOCK_WINDOW + timer expires → applyActionEffect (queue target) → INFLUENCE_LOSS (target picks) → concludeTurn
BLOCK_WINDOW + target claims Contessa → BLOCK_CHALLENGE_WINDOW
  ├── timer expires → block stands → action canceled → concludeTurn (target unhurt)
  ├── challenge proven → swap card → challenger (actor) picks → concludeTurn (target unhurt)
  └── challenge disproven → block fails → queue [blocker, target] → target picks TWICE → eliminated
CHALLENGE_WINDOW + challenge:
  ├── proven (actor has Assassin) → swap card → queue [challenger, target] → both pick → concludeTurn
  └── disproven (actor bluffed) → claimant picks → concludeTurn (target unhurt)
```

**SKILL.md § 4.4 — coins paid at declaration stay paid in every path**, including
canceled / disproven / blocked.

Only the **target** can block Assassinate.

### Exchange — SKILL.md § 4.4 (Ambassador)
```
AWAITING_ACTION → [applyExchange] (rejects if <2 face-down cards) → CHALLENGE_WINDOW
CHALLENGE_WINDOW + timer expires → applyActionEffect (set exchangePool) → EXCHANGE_SELECTION
CHALLENGE_WINDOW + challenge:
  ├── proven → swap card → queue [challenger] + exchangePool set → INFLUENCE_LOSS
  │     after challenger picks → EXCHANGE_SELECTION (queue empty + pool set)
  └── disproven → claimant picks → concludeTurn (no exchange)
EXCHANGE_SELECTION → [applyExchangePick(keepIndices)] → swap actor hand + return 2 to deck → concludeTurn
```

Exchange is **not blockable**. The proven-challenge path sequences influence-loss
*before* exchange-selection.

## Key invariants

### Coin invariant
Total coins on the table = sum of all actors' coins. Income adds 1; Foreign Aid adds 2;
Tax adds 3; Coup removes 7; Assassinate removes 3; Steal is zero-sum (target → actor).
Coins are never refunded by canceled / failed paths (SKILL.md § 4.4).

### Card multiset invariant
The union of all cards in seat influence (face-down + revealed) and the court deck
always equals the canonical `DECK` constant: 3 each of Duke, Assassin, Captain,
Ambassador, Contessa = 15 cards. `replaceCardWithDraw` and `applyExchangePick`
preserve this via `returnToDeckAndShuffle`. Verified by Vitest in every test that
exercises card-swap paths.

### Phase guard invariant
Every action handler **must** call `requirePhase(state, EXPECTED_PHASE)` as its
first check before any state mutation. SKILL.md § 5.

### Hidden-information invariant
`buildPlayerView` is the only function allowed to slice `GameState` for broadcast.
Other players' face-down cards become `{ status: 'hidden' }` with no `kind`. The
court deck becomes `{ count }` only. SKILL.md § 3.1.

## Queue & pool semantics

### `influenceLossQueue`
- FIFO queue of `PlayerId`s pending INFLUENCE_LOSS.
- Head is the current picker.
- After `applyInfluencePick` resolves, head is shifted off.
- If queue still non-empty → stay in INFLUENCE_LOSS for next picker.
- If queue empty AND `exchangePool` set → transition to EXCHANGE_SELECTION.
- If queue empty AND no `exchangePool` → `concludeTurn`.
- Cleared defensively by `concludeTurn`.

### `exchangePool`
- Set when Exchange's action effect applies (no-challenge timeout or proven challenge).
- Contains `{ actorPlayerId, cards: [own0, own1, drawn0, drawn1] }` where `own*` are
  the actor's current face-down cards (in `influence` order) and `drawn*` are 2
  freshly drawn from the deck.
- Only the actor sees this (DO sends as a `prompt` message, not in `PlayerView`).
- Cleared by `applyExchangePick` and defensively by `concludeTurn`.

## Resolution dispatcher: `resolveAfterEffects`

Single decision point used by every "action just resolved" call site
(`applyChallengeWindowTimeout`, `applyBlockWindowTimeout`, `resolveActionChallenge`
proven, `resolveBlockChallenge` disproven). Order:

1. Clear `pendingAction`, `pendingBlock`, `timerEndsAt` — they belonged to the
   just-resolved interaction.
2. If `influenceLossQueue` is non-empty → `phase = INFLUENCE_LOSS`.
3. Else if `exchangePool` is set → `phase = EXCHANGE_SELECTION`.
4. Else → `concludeTurn` (win check + turn advance, or GAME_OVER).

## Challenge race tie-break — SKILL.md § 3.2

Pure game-logic accepts the first `applyChallenge` call during CHALLENGE_WINDOW or
BLOCK_CHALLENGE_WINDOW. After the first call resolves, the phase changes to
INFLUENCE_LOSS (or other), so subsequent `applyChallenge` calls bounce with
`wrong_phase`. The DO is responsible for ordering concurrent messages by receive
timestamp before invoking this handler.

## Error codes (stable identifiers for server error responses)

Every `IllegalActionError` carries a `code` field. Stable codes the server may
include verbatim in `server-messages::error`:

| Code | Thrown by | Meaning |
|---|---|---|
| `wrong_phase` | Every handler's `requirePhase` | Called in wrong phase |
| `not_your_turn` | Action handlers | Actor isn't the turn-holder |
| `unknown_player` | `getActor` | playerId not in seats |
| `player_eliminated` | `requireAlive` | Actor is dead |
| `must_coup` | `requireNotForcedToCoup` | Actor has ≥10 coins; only Coup is legal |
| `insufficient_coins` | Coup, Assassinate | Actor lacks the cost |
| `cannot_target_self` | Coup, Steal, Assassinate | Targeted action on self |
| `invalid_target` | Coup, Steal, Assassinate | Target not seated |
| `target_eliminated` | Coup, Steal, Assassinate | Target is dead |
| `no_loss_target` | `applyInfluencePick`, `applyInfluenceTimeout` | INFLUENCE_LOSS with empty queue (inconsistent state) |
| `not_your_pick` | `applyInfluencePick`, `applyInfluenceTimeout` | Wrong player tried to pick |
| `invalid_card_index` | `applyInfluencePick` | cardIndex out of range |
| `card_already_revealed` | `applyInfluencePick` | Chose an already-revealed card |
| `no_face_down_cards` | `applyInfluenceTimeout` | Picker has no face-down cards (inconsistent state) |
| `cannot_self_challenge` | `applyChallenge` | Claimant/blocker challenged their own claim |
| `unchallengeable_action` | `resolveActionChallenge` | Action isn't a character claim (defensive) |
| `no_pending_action` | Challenge / block handlers | Window has no pendingAction (inconsistent state) |
| `no_pending_block` | `resolveBlockChallenge` | BLOCK_CHALLENGE_WINDOW has no pendingBlock |
| `unsupported_pending` | `applyChallengeWindowTimeout` | Defensive — non-challengeable action in CHALLENGE_WINDOW |
| `unblockable_action` | `validateBlock` | Pending action can't be blocked |
| `invalid_block_character` | `validateBlock` | Blocker claim doesn't match action |
| `cannot_block_own_action` | `validateBlock` | Actor tried to block themselves |
| `only_target_can_block` | `validateBlock` | Non-target tried to block Steal/Assassinate |
| `exchange_requires_two_cards` | `applyExchange`, `applyActionEffect` | Actor has <2 face-down cards (v1 limitation) |
| `no_exchange_pool` | `applyExchangePick` | EXCHANGE_SELECTION with no exchangePool (inconsistent state) |
| `not_your_exchange` | `applyExchangePick` | Wrong player tried to exchange-pick |
| `invalid_keep_indices` | `applyExchangePick` | keepIndices wrong length or out of range |
| `duplicate_keep_indices` | `applyExchangePick` | keepIndices contains same index twice |

## V1 limitations

- **`influenceLossQueue[0]` and `exchangePool` not exposed in `PlayerView`.** Other
  players can derive the picker from `pendingAction` for Coup but not for
  challenge-driven losses. UX gap. Future enhancement: add
  `influenceLossTarget: PlayerId | null` to `PlayerView`.
- **Exchange requires exactly 2 face-down cards.** 1-card players (with one already
  revealed) can't do Exchange because the protocol's `client-messages::exchange-pick.keepIndices`
  is fixed-length 2. Standard Coup allows 1-card Exchange (keep 1 of 3); future
  enhancement requires a protocol change.
- **Eliminated players keep their coins.** No mechanical impact (they can't act,
  can't be targeted, can't block), but the coin total on the table includes dead
  players' piles. Standard Coup rules don't strictly require zeroing.
- **Forfeit-on-disconnect not implemented.** SKILL.md § 3.5 — the DO's 30s alarm
  + auto-reveal logic lives at the DO layer, not in pure game-logic.

## Where to extend

| To add... | Edit | And add tests in |
|---|---|---|
| A new action effect | `applyActionEffect` switch in `actions.ts` | Existing per-action test file or new |
| A new pre-action check | New `require*` helper in `actions.ts` | `actions.test.ts` |
| A new phase | `Phase` enum in `protocol/src/domain.ts` + state.ts comment + handlers | All test fixtures (rare) |
| A new error code | Inline at the throw site; document in this file | The test that exercises the throw |
| A new client message | `protocol/src/client-messages.ts` + a handler | `packages/game-logic/test/*.test.ts` |
