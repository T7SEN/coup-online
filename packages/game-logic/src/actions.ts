import type { Action, Phase, PlayerId } from '@coup-online/protocol'
import { drawFromDeck, returnToDeckAndShuffle } from './deck'
import type { GameState, ServerSeat } from './state'
import { checkWinner } from './win-condition'

// Thrown by action handlers when the request is illegal under the current state.
// `code` is a stable machine-readable identifier the server can include verbatim
// in a `server-messages::error` response.
export class IllegalActionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'IllegalActionError'
  }
}

// --- Validation helpers (exported for use by challenges.ts / blocks.ts) ---

export function requirePhase(state: GameState, expected: Phase): void {
  if (state.phase !== expected) {
    throw new IllegalActionError(
      'wrong_phase',
      `Expected phase ${expected}, got ${state.phase}`,
    )
  }
}

export function getActor(state: GameState, actorPlayerId: PlayerId): ServerSeat {
  const seat = state.seats.find((s) => s.playerId === actorPlayerId)
  if (!seat) {
    throw new IllegalActionError(
      'unknown_player',
      `Player "${actorPlayerId}" is not seated in this match`,
    )
  }
  return seat
}

export function requireAlive(seat: ServerSeat): void {
  if (!seat.isAlive) {
    throw new IllegalActionError(
      'player_eliminated',
      `Player "${seat.playerId}" has been eliminated and cannot act`,
    )
  }
}

function requireTurnOwnership(state: GameState, actorPlayerId: PlayerId): void {
  const turnPlayer = state.seats[state.turnIndex]
  if (turnPlayer.playerId !== actorPlayerId) {
    throw new IllegalActionError(
      'not_your_turn',
      `Player "${actorPlayerId}" attempted an action on "${turnPlayer.playerId}"'s turn`,
    )
  }
}

function requireNotForcedToCoup(actor: ServerSeat): void {
  if (actor.coins >= 10) {
    throw new IllegalActionError(
      'must_coup',
      `Player "${actor.playerId}" has ${actor.coins} coins and must Coup`,
    )
  }
}

// Validate that a target for a targeted action (Coup, Steal, Assassinate) is
// legal: not self, exists in the seat list, alive. Shared by Coup / Steal / Assassinate.
function requireTargetValid(
  state: GameState,
  actorPlayerId: PlayerId,
  targetPlayerId: PlayerId,
): void {
  if (actorPlayerId === targetPlayerId) {
    throw new IllegalActionError(
      'cannot_target_self',
      `Player "${actorPlayerId}" cannot target themselves`,
    )
  }
  const target = state.seats.find((s) => s.playerId === targetPlayerId)
  if (!target) {
    throw new IllegalActionError(
      'invalid_target',
      `Target "${targetPlayerId}" is not seated in this match`,
    )
  }
  if (!target.isAlive) {
    throw new IllegalActionError(
      'target_eliminated',
      `Target "${targetPlayerId}" has already been eliminated`,
    )
  }
}

// --- Effect helpers (exported for use by challenges.ts / blocks.ts) ---

// Apply the action's effect. Called when an action resolves: timer expiry with
// no challenge (Tax/Exchange), no-block timeout (FA/Steal/Assassinate), proven
// challenge (action proceeds), or disproven block challenge (block fails).
// For Assassinate, "effect" queues the target's influence loss rather than
// applying it directly — the caller transitions to INFLUENCE_LOSS via
// resolveAfterEffects(). For Exchange, "effect" sets up exchangePool — caller
// transitions to EXCHANGE_SELECTION.
export function applyActionEffect(
  state: GameState,
  action: Action,
  actorPlayerId: PlayerId,
): void {
  const actor = getActor(state, actorPlayerId)
  switch (action.kind) {
    case 'Tax':
      // SKILL.md § 4.4 — Duke → Tax: take 3 coins.
      actor.coins += 3
      return
    case 'ForeignAid':
      // SKILL.md § 4.3 — take 2 coins.
      actor.coins += 2
      return
    case 'Steal': {
      // SKILL.md § 4.4 — Captain → Steal: take up to 2 coins from target
      // (or all if target has fewer). Target validated at applyStealAction time;
      // getActor here is defense-in-depth against state-inconsistency bugs.
      const target = getActor(state, action.targetPlayerId)
      const amount = Math.min(2, target.coins)
      target.coins -= amount
      actor.coins += amount
      return
    }
    case 'Assassinate':
      // SKILL.md § 4.4 — Assassin → Assassinate: target loses an influence.
      // Coins were already paid at declaration (§ 4.4 — paid even if blocked
      // or challenged-and-lost). We just enqueue the target's loss; the caller
      // transitions to INFLUENCE_LOSS via resolveAfterEffects().
      state.influenceLossQueue.push(action.targetPlayerId)
      return
    case 'Exchange': {
      // SKILL.md § 4.4 — Ambassador → Exchange: draw 2 from Court Deck, present
      // the 4-card pool privately, actor picks 2 to keep. Sets up exchangePool;
      // caller transitions to EXCHANGE_SELECTION via resolveAfterEffects().
      const faceDownKinds = actor.influence
        .filter((inf) => inf.status === 'face-down')
        .map((inf) => inf.kind)
      if (faceDownKinds.length !== 2) {
        // v1 limitation: protocol's keepIndices is fixed-length 2. Variable-size
        // exchange (e.g., 1 face-down → keep 1 of 3) is deferred.
        throw new IllegalActionError(
          'exchange_requires_two_cards',
          `Exchange currently requires 2 face-down cards; actor has ${faceDownKinds.length}`,
        )
      }
      const drawn = drawFromDeck(state.courtDeck, 2)
      state.exchangePool = {
        actorPlayerId: actorPlayerId,
        cards: [...faceDownKinds, ...drawn],
      }
      return
    }
    case 'Income':
    case 'Coup':
      throw new Error(
        `applyActionEffect: action "${action.kind}" does not resolve through this path`,
      )
  }
}

// SKILL.md § 4.6 — when a character claim is challenged and PROVEN, the claimant
// returns the proven card to the Court Deck, the deck is reshuffled, and the
// claimant draws a fresh replacement. Preserves anonymity for future bluffs.
export function replaceCardWithDraw(
  state: GameState,
  seat: ServerSeat,
  cardIdx: number,
): void {
  const card = seat.influence[cardIdx]
  if (card.status !== 'face-down') {
    throw new Error(`replaceCardWithDraw: card at index ${cardIdx} must be face-down`)
  }
  returnToDeckAndShuffle(state.courtDeck, [card.kind])
  const replacement = state.courtDeck.pop()
  if (!replacement) {
    throw new Error('replaceCardWithDraw: court deck is empty')
  }
  seat.influence[cardIdx] = { status: 'face-down', kind: replacement }
}

// After applying an action effect (or block-failure / proven-challenge resolution),
// determine the next phase. Single canonical decision point so the rule chain is
// consistent across all callers.
//   1. influenceLossQueue non-empty → INFLUENCE_LOSS (head is picker)
//   2. exchangePool set → EXCHANGE_SELECTION
//   3. otherwise → concludeTurn (turn advances)
// Clears pendingAction / pendingBlock / timerEndsAt before deciding — those
// belong to the just-resolved interaction.
export function resolveAfterEffects(state: GameState): GameState {
  state.pendingAction = null
  state.pendingBlock = null
  state.timerEndsAt = null
  if (state.influenceLossQueue.length > 0) {
    state.phase = 'INFLUENCE_LOSS'
    return state
  }
  if (state.exchangePool) {
    state.phase = 'EXCHANGE_SELECTION'
    return state
  }
  return concludeTurn(state)
}

function findNextLivingSeat(state: GameState, fromIndex: number): number {
  const n = state.seats.length
  for (let step = 1; step <= n; step++) {
    const idx = (fromIndex + step) % n
    if (state.seats[idx].isAlive) return idx
  }
  return fromIndex
}

// The 1-based ordinal to stamp on the NEXT seat to be eliminated: one more than
// the count of seats already carrying an eliminationOrder. Call it before
// assigning `seat.eliminationOrder` (the about-to-die seat is still null, so it
// is not counted). Two seats eliminated in the same influence-loss chain get
// distinct, monotonically increasing values — each elimination calls this once.
export function nextEliminationOrder(state: GameState): number {
  return state.seats.filter((s) => s.eliminationOrder != null).length + 1
}

// SKILL.md § 3.2 phase 8 + § 4.8 — TURN_END handling. Win-condition check; if
// game over, GAME_OVER; otherwise advance to next living seat. Clears ALL
// pending state defensively.
export function concludeTurn(state: GameState): GameState {
  state.pendingAction = null
  state.pendingBlock = null
  state.timerEndsAt = null
  state.influenceLossQueue.length = 0
  state.exchangePool = null
  const winner = checkWinner(state)
  if (winner) {
    state.phase = 'GAME_OVER'
    return state
  }
  state.turnIndex = findNextLivingSeat(state, state.turnIndex)
  state.phase = 'AWAITING_ACTION'
  return state
}

// --- Action handlers --------------------------------------------------------

// Income — SKILL.md § 4.3. Take 1 coin. Not challengeable, not blockable.
export function applyIncome(state: GameState, actorPlayerId: PlayerId): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  actor.coins += 1
  return concludeTurn(state)
}

// Coup — SKILL.md § 4.3. Pay 7 coins; target loses an influence.
// Not challengeable, not blockable. Coins paid before INFLUENCE_LOSS opens.
export function applyCoup(
  state: GameState,
  actorPlayerId: PlayerId,
  targetPlayerId: PlayerId,
): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  if (actor.coins < 7) {
    throw new IllegalActionError(
      'insufficient_coins',
      `Coup requires 7 coins; player "${actorPlayerId}" has ${actor.coins}`,
    )
  }
  requireTargetValid(state, actorPlayerId, targetPlayerId)

  actor.coins -= 7
  state.phase = 'INFLUENCE_LOSS'
  state.pendingAction = {
    actorPlayerId,
    action: { kind: 'Coup', targetPlayerId },
  }
  state.influenceLossQueue.push(targetPlayerId)
  return state
}

// Tax — SKILL.md § 4.4. Claims Duke. Challengeable. Not blockable.
export function applyTax(state: GameState, actorPlayerId: PlayerId): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  state.phase = 'CHALLENGE_WINDOW'
  state.pendingAction = { actorPlayerId, action: { kind: 'Tax' } }
  return state
}

// Foreign Aid — SKILL.md § 4.3. NOT challengeable. Blockable by Duke (any player).
export function applyForeignAid(state: GameState, actorPlayerId: PlayerId): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  state.phase = 'BLOCK_WINDOW'
  state.pendingAction = { actorPlayerId, action: { kind: 'ForeignAid' } }
  return state
}

// Steal — SKILL.md § 4.4. Claims Captain. Challengeable. Blockable by Captain or
// Ambassador (target only). Enters CHALLENGE_WINDOW; on no-challenge transitions
// to BLOCK_WINDOW.
export function applyStealAction(
  state: GameState,
  actorPlayerId: PlayerId,
  targetPlayerId: PlayerId,
): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  requireTargetValid(state, actorPlayerId, targetPlayerId)
  state.phase = 'CHALLENGE_WINDOW'
  state.pendingAction = {
    actorPlayerId,
    action: { kind: 'Steal', targetPlayerId },
  }
  return state
}

// Assassinate — SKILL.md § 4.4. Claims Assassin. Challengeable. Blockable by
// Contessa (target only). 3 coins paid AT DECLARATION (§ 4.4) — stays paid even
// if blocked or challenged-and-lost.
export function applyAssassinate(
  state: GameState,
  actorPlayerId: PlayerId,
  targetPlayerId: PlayerId,
): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  if (actor.coins < 3) {
    throw new IllegalActionError(
      'insufficient_coins',
      `Assassinate requires 3 coins; player "${actorPlayerId}" has ${actor.coins}`,
    )
  }
  requireTargetValid(state, actorPlayerId, targetPlayerId)
  // SKILL.md § 4.4 — coins paid at declaration. Not refunded under any path.
  actor.coins -= 3
  state.phase = 'CHALLENGE_WINDOW'
  state.pendingAction = {
    actorPlayerId,
    action: { kind: 'Assassinate', targetPlayerId },
  }
  return state
}

// Exchange — SKILL.md § 4.4. Claims Ambassador. Challengeable. Not blockable.
// On no-challenge resolution, applyActionEffect sets up exchangePool and the
// phase advances to EXCHANGE_SELECTION via resolveAfterEffects().
//
// v1 limitation: requires exactly 2 face-down cards (protocol's keepIndices is
// fixed-length 2). Checked at declaration for immediate feedback rather than
// surfacing the error at challenge-window timeout. Defense-in-depth check still
// lives in applyActionEffect for direct-call safety.
export function applyExchange(state: GameState, actorPlayerId: PlayerId): GameState {
  requirePhase(state, 'AWAITING_ACTION')
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  const faceDownCount = actor.influence.filter((inf) => inf.status === 'face-down').length
  if (faceDownCount !== 2) {
    throw new IllegalActionError(
      'exchange_requires_two_cards',
      `Exchange currently requires 2 face-down cards; actor has ${faceDownCount}`,
    )
  }
  state.phase = 'CHALLENGE_WINDOW'
  state.pendingAction = { actorPlayerId, action: { kind: 'Exchange' } }
  return state
}

// --- Influence-loss resolution ---------------------------------------------

// Resolve the head of the influence-loss queue by flipping the chosen card to
// revealed. SKILL.md § 4.7. After the pick is consumed:
//   - If queue still has entries, stay in INFLUENCE_LOSS (next player picks).
//   - Else if exchangePool is set (e.g., Exchange proven challenge), transition
//     to EXCHANGE_SELECTION so the actor finishes their exchange.
//   - Else concludeTurn.
export function applyInfluencePick(
  state: GameState,
  pickerPlayerId: PlayerId,
  cardIndex: number,
): GameState {
  requirePhase(state, 'INFLUENCE_LOSS')
  if (state.influenceLossQueue.length === 0) {
    throw new IllegalActionError(
      'no_loss_target',
      'INFLUENCE_LOSS phase has an empty influenceLossQueue; state is inconsistent',
    )
  }
  const expectedPicker = state.influenceLossQueue[0]
  if (pickerPlayerId !== expectedPicker) {
    throw new IllegalActionError(
      'not_your_pick',
      `Influence pick is for "${expectedPicker}"; got "${pickerPlayerId}"`,
    )
  }
  const seat = getActor(state, pickerPlayerId)
  if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= seat.influence.length) {
    throw new IllegalActionError(
      'invalid_card_index',
      `cardIndex ${cardIndex} is out of range for influence array of length ${seat.influence.length}`,
    )
  }
  const card = seat.influence[cardIndex]
  if (card.status !== 'face-down') {
    throw new IllegalActionError(
      'card_already_revealed',
      `Card at index ${cardIndex} is already revealed`,
    )
  }
  seat.influence[cardIndex] = { status: 'revealed', kind: card.kind }
  if (seat.influence.every((inf) => inf.status === 'revealed')) {
    seat.isAlive = false
    // Stamp the finishing order once, at the elimination moment. SKILL.md § 4.8.
    seat.eliminationOrder = nextEliminationOrder(state)
  }
  // Consume this entry.
  state.influenceLossQueue.shift()
  if (state.influenceLossQueue.length > 0) {
    return state
  }
  if (state.exchangePool) {
    state.phase = 'EXCHANGE_SELECTION'
    return state
  }
  return concludeTurn(state)
}

// SKILL.md § 4.7 — INFLUENCE_LOSS timeout auto-picks the leftmost face-down card.
export function applyInfluenceTimeout(
  state: GameState,
  pickerPlayerId: PlayerId,
): GameState {
  requirePhase(state, 'INFLUENCE_LOSS')
  if (state.influenceLossQueue.length === 0) {
    throw new IllegalActionError(
      'no_loss_target',
      'INFLUENCE_LOSS phase has an empty influenceLossQueue; state is inconsistent',
    )
  }
  const expectedPicker = state.influenceLossQueue[0]
  if (pickerPlayerId !== expectedPicker) {
    throw new IllegalActionError(
      'not_your_pick',
      `Influence-loss timeout is for "${expectedPicker}"; got "${pickerPlayerId}"`,
    )
  }
  const seat = getActor(state, pickerPlayerId)
  const leftmost = seat.influence.findIndex((inf) => inf.status === 'face-down')
  if (leftmost === -1) {
    throw new IllegalActionError(
      'no_face_down_cards',
      `Player "${pickerPlayerId}" has no face-down cards to auto-pick`,
    )
  }
  return applyInfluencePick(state, pickerPlayerId, leftmost)
}

// --- Exchange resolution ----------------------------------------------------

// SKILL.md § 3.2 phase 7 / § 4.4 — actor picks which 2 of the 4-card pool to
// keep. Server validates the indices form a valid subset; the kept cards
// replace the actor's face-down hand; the returned cards go back to the deck
// and the deck is reshuffled (SKILL.md § 4.6 anonymity rule applies here too).
export function applyExchangePick(
  state: GameState,
  actorPlayerId: PlayerId,
  keepIndices: readonly number[],
): GameState {
  requirePhase(state, 'EXCHANGE_SELECTION')
  if (!state.exchangePool) {
    throw new IllegalActionError(
      'no_exchange_pool',
      'EXCHANGE_SELECTION has no exchangePool; state is inconsistent',
    )
  }
  if (actorPlayerId !== state.exchangePool.actorPlayerId) {
    throw new IllegalActionError(
      'not_your_exchange',
      `Exchange pick is for "${state.exchangePool.actorPlayerId}"; got "${actorPlayerId}"`,
    )
  }
  if (keepIndices.length !== 2) {
    throw new IllegalActionError(
      'invalid_keep_indices',
      `keepIndices must have length 2 (got ${keepIndices.length})`,
    )
  }
  for (const i of keepIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= state.exchangePool.cards.length) {
      throw new IllegalActionError(
        'invalid_keep_indices',
        `keepIndices contains out-of-range value ${i}`,
      )
    }
  }
  if (keepIndices[0] === keepIndices[1]) {
    throw new IllegalActionError(
      'duplicate_keep_indices',
      'keepIndices must reference two distinct cards in the pool',
    )
  }
  const pool = state.exchangePool.cards
  const kept = [pool[keepIndices[0]], pool[keepIndices[1]]]
  const returned: typeof pool = []
  for (let i = 0; i < pool.length; i++) {
    if (i !== keepIndices[0] && i !== keepIndices[1]) returned.push(pool[i])
  }
  // Replace actor's face-down cards with the kept ones, preserving order of
  // face-down slots. Revealed slots stay untouched.
  const actor = getActor(state, actorPlayerId)
  let k = 0
  for (let i = 0; i < actor.influence.length; i++) {
    if (actor.influence[i].status === 'face-down') {
      actor.influence[i] = { status: 'face-down', kind: kept[k++] }
    }
  }
  // Return the unchosen 2 cards to the Court Deck and reshuffle. SKILL.md § 4.6.
  returnToDeckAndShuffle(state.courtDeck, returned)
  state.exchangePool = null
  return concludeTurn(state)
}

// EXCHANGE_SELECTION timer expiry — auto-keep the actor's original 2 cards
// (pool indices [0, 1]). Information-preserving: returns both drawn cards to
// the deck, hand unchanged. Could also pick "first two" arbitrarily; either is
// deterministic and documented to players via tooltip.
export function applyExchangeTimeout(
  state: GameState,
  actorPlayerId: PlayerId,
): GameState {
  return applyExchangePick(state, actorPlayerId, [0, 1])
}
