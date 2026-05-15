import type { Action, CardKind, PlayerId } from '@coup-online/protocol'
import {
  applyActionEffect,
  getActor,
  IllegalActionError,
  replaceCardWithDraw,
  requireAlive,
  resolveAfterEffects,
} from './actions'
import type { GameState } from './state'

// The character a given action implicitly claims. Null if the action is not a
// character claim (Income / ForeignAid / Coup are general actions and aren't
// challengeable; SKILL.md § 4.3 + § 4.4).
export function getClaimedCharacter(action: Action): CardKind | null {
  switch (action.kind) {
    case 'Tax':
      return 'Duke'
    case 'Assassinate':
      return 'Assassin'
    case 'Steal':
      // Steal claims Captain. Captain or Ambassador can BLOCK Steal, but the
      // action itself is a Captain claim (SKILL.md § 4.4).
      return 'Captain'
    case 'Exchange':
      return 'Ambassador'
    case 'Income':
    case 'ForeignAid':
    case 'Coup':
      return null
  }
}

// SKILL.md § 4.6 — challenge a pending character claim. Dispatches by phase:
//   - CHALLENGE_WINDOW: challenges the pending ACTION
//   - BLOCK_CHALLENGE_WINDOW: challenges the pending BLOCK claim
// First server-received challenge wins; subsequent ones bounce with wrong_phase
// after the first transitions out of the window.
export function applyChallenge(
  state: GameState,
  challengerPlayerId: PlayerId,
): GameState {
  if (state.phase === 'CHALLENGE_WINDOW') {
    return resolveActionChallenge(state, challengerPlayerId)
  }
  if (state.phase === 'BLOCK_CHALLENGE_WINDOW') {
    return resolveBlockChallenge(state, challengerPlayerId)
  }
  throw new IllegalActionError(
    'wrong_phase',
    `Expected phase CHALLENGE_WINDOW or BLOCK_CHALLENGE_WINDOW, got ${state.phase}`,
  )
}

// Action challenge resolution.
// PROVEN: claimant has the card → swap from deck → action effect resolves →
//   challenger picks. For Assassinate proven, applyActionEffect queues target
//   too, so the queue ends up [challenger, target] and both pick in order.
// DISPROVEN: claimant was bluffing → action canceled → claimant picks.
function resolveActionChallenge(
  state: GameState,
  challengerPlayerId: PlayerId,
): GameState {
  if (!state.pendingAction) {
    throw new IllegalActionError(
      'no_pending_action',
      'CHALLENGE_WINDOW has no pendingAction; state is inconsistent',
    )
  }
  const claim = state.pendingAction.action
  const claimedCharacter = getClaimedCharacter(claim)
  if (!claimedCharacter) {
    throw new IllegalActionError(
      'unchallengeable_action',
      `Action "${claim.kind}" is not a character claim and cannot be challenged`,
    )
  }
  const claimantId = state.pendingAction.actorPlayerId
  if (challengerPlayerId === claimantId) {
    throw new IllegalActionError(
      'cannot_self_challenge',
      'A player cannot challenge their own claim',
    )
  }
  const challenger = getActor(state, challengerPlayerId)
  requireAlive(challenger)
  const claimant = getActor(state, claimantId)

  const matchingIdx = claimant.influence.findIndex(
    (inf) => inf.status === 'face-down' && inf.kind === claimedCharacter,
  )

  if (matchingIdx !== -1) {
    // PROVEN: action effect applies; challenger loses. For Assassinate proven,
    // applyActionEffect queues the target loss too — order: challenger then target.
    replaceCardWithDraw(state, claimant, matchingIdx)
    state.influenceLossQueue.push(challengerPlayerId)
    applyActionEffect(state, claim, claimantId)
    return resolveAfterEffects(state)
  }

  // DISPROVEN: action canceled, claimant loses. For Assassinate, coins paid at
  // declaration stay paid (§ 4.4) — no refund here.
  state.influenceLossQueue.push(claimantId)
  return resolveAfterEffects(state)
}

// Block challenge resolution. Same proven/disproven semantics; inverted flow:
// PROVEN block: block stands, action canceled, challenger picks.
// DISPROVEN block: block fails, action effect resolves, blocker picks. For
//   Assassinate blocked-and-disproven, the blocker IS the target, so queue
//   becomes [blocker, target] = [target, target] → target picks twice.
function resolveBlockChallenge(
  state: GameState,
  challengerPlayerId: PlayerId,
): GameState {
  if (!state.pendingBlock) {
    throw new IllegalActionError(
      'no_pending_block',
      'BLOCK_CHALLENGE_WINDOW has no pendingBlock; state is inconsistent',
    )
  }
  if (!state.pendingAction) {
    throw new IllegalActionError(
      'no_pending_action',
      'BLOCK_CHALLENGE_WINDOW has no pendingAction; state is inconsistent',
    )
  }
  const claimedCharacter = state.pendingBlock.claimedCharacter
  const blockerId = state.pendingBlock.blockerPlayerId
  if (challengerPlayerId === blockerId) {
    throw new IllegalActionError(
      'cannot_self_challenge',
      'A player cannot challenge their own block claim',
    )
  }
  const challenger = getActor(state, challengerPlayerId)
  requireAlive(challenger)
  const blocker = getActor(state, blockerId)

  const matchingIdx = blocker.influence.findIndex(
    (inf) => inf.status === 'face-down' && inf.kind === claimedCharacter,
  )

  if (matchingIdx !== -1) {
    // PROVEN — block stands, action canceled, challenger loses.
    replaceCardWithDraw(state, blocker, matchingIdx)
    state.influenceLossQueue.push(challengerPlayerId)
    return resolveAfterEffects(state)
  }

  // DISPROVEN — block fails, action resolves, blocker loses.
  state.influenceLossQueue.push(blockerId)
  applyActionEffect(state, state.pendingAction.action, state.pendingAction.actorPlayerId)
  return resolveAfterEffects(state)
}

// SKILL.md § 3.2 — CHALLENGE_WINDOW timer expires with no challenge. Branch by
// action's post-window phase:
//   Tax: not blockable → effect resolves, conclude
//   Steal / Assassinate: blockable → BLOCK_WINDOW
//   Exchange: not blockable → effect resolves (sets exchangePool), enter EXCHANGE_SELECTION
//   Income / Coup / ForeignAid: never enter CHALLENGE_WINDOW (defensive throw)
export function applyChallengeWindowTimeout(state: GameState): GameState {
  if (state.phase !== 'CHALLENGE_WINDOW') {
    throw new IllegalActionError(
      'wrong_phase',
      `Expected phase CHALLENGE_WINDOW, got ${state.phase}`,
    )
  }
  if (!state.pendingAction) {
    throw new IllegalActionError(
      'no_pending_action',
      'CHALLENGE_WINDOW has no pendingAction; state is inconsistent',
    )
  }
  const action = state.pendingAction.action
  const actorId = state.pendingAction.actorPlayerId
  switch (action.kind) {
    case 'Tax':
    case 'Exchange':
      applyActionEffect(state, action, actorId)
      return resolveAfterEffects(state)
    case 'Steal':
    case 'Assassinate':
      state.phase = 'BLOCK_WINDOW'
      state.timerEndsAt = null
      return state
    case 'Income':
    case 'Coup':
    case 'ForeignAid':
      throw new IllegalActionError(
        'unsupported_pending',
        `Action "${action.kind}" should not be in CHALLENGE_WINDOW`,
      )
  }
}
