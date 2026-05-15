import type { Action, BlockerCharacter, PlayerId } from '@coup-online/protocol'
import {
  applyActionEffect,
  concludeTurn,
  getActor,
  IllegalActionError,
  requireAlive,
  requirePhase,
  resolveAfterEffects,
} from './actions'
import type { GameState } from './state'

// The characters that may legally block each action. SKILL.md § 4.5.
//   - Foreign Aid: Duke
//   - Steal: Captain or Ambassador
//   - Assassinate: Contessa
//   - Income / Coup / Tax / Exchange: unblockable
export function getBlockerCharacters(action: Action): readonly BlockerCharacter[] {
  switch (action.kind) {
    case 'ForeignAid':
      return ['Duke']
    case 'Steal':
      return ['Captain', 'Ambassador']
    case 'Assassinate':
      return ['Contessa']
    case 'Income':
    case 'Coup':
    case 'Tax':
    case 'Exchange':
      return []
  }
}

// Validate that the proposed block is legal given the pending action and the
// blocker's identity. Throws IllegalActionError with a stable `code` on failure.
function validateBlock(
  pending: { actorPlayerId: PlayerId; action: Action },
  blockerId: PlayerId,
  claimedCharacter: BlockerCharacter,
): void {
  const validBlockers = getBlockerCharacters(pending.action)
  if (validBlockers.length === 0) {
    throw new IllegalActionError(
      'unblockable_action',
      `Action "${pending.action.kind}" cannot be blocked`,
    )
  }
  if (!validBlockers.includes(claimedCharacter)) {
    throw new IllegalActionError(
      'invalid_block_character',
      `Action "${pending.action.kind}" can only be blocked by ${validBlockers.join(' or ')}, not ${claimedCharacter}`,
    )
  }
  if (blockerId === pending.actorPlayerId) {
    throw new IllegalActionError(
      'cannot_block_own_action',
      `Player "${blockerId}" cannot block their own action`,
    )
  }
  // Targeted actions (Steal, Assassinate) can only be blocked by the target.
  // Foreign Aid is blockable by any non-actor.
  if (pending.action.kind === 'Steal' || pending.action.kind === 'Assassinate') {
    if (blockerId !== pending.action.targetPlayerId) {
      throw new IllegalActionError(
        'only_target_can_block',
        `Only the target of ${pending.action.kind} can block it`,
      )
    }
  }
}

// SKILL.md § 4.5 — declare a block on the pending action by claiming a blocker
// character. Transitions to BLOCK_CHALLENGE_WINDOW so the block claim can itself
// be challenged before resolving. The blocker doesn't need to actually hold the
// claimed card; bluffing is legal (and exposed only on challenge).
export function applyBlock(
  state: GameState,
  blockerPlayerId: PlayerId,
  claimedCharacter: BlockerCharacter,
): GameState {
  requirePhase(state, 'BLOCK_WINDOW')
  if (!state.pendingAction) {
    throw new IllegalActionError(
      'no_pending_action',
      'BLOCK_WINDOW has no pendingAction; state is inconsistent',
    )
  }
  const blocker = getActor(state, blockerPlayerId)
  requireAlive(blocker)
  validateBlock(state.pendingAction, blockerPlayerId, claimedCharacter)
  state.phase = 'BLOCK_CHALLENGE_WINDOW'
  state.pendingBlock = {
    blockerPlayerId,
    claimedCharacter,
  }
  return state
}

// SKILL.md § 3.2 phase 4 — BLOCK_WINDOW timer expires with no block declared.
// The original action resolves. resolveAfterEffects() picks the right next phase
// (INFLUENCE_LOSS for Assassinate target, AWAITING_ACTION otherwise).
export function applyBlockWindowTimeout(state: GameState): GameState {
  requirePhase(state, 'BLOCK_WINDOW')
  if (!state.pendingAction) {
    throw new IllegalActionError(
      'no_pending_action',
      'BLOCK_WINDOW has no pendingAction; state is inconsistent',
    )
  }
  applyActionEffect(state, state.pendingAction.action, state.pendingAction.actorPlayerId)
  return resolveAfterEffects(state)
}

// SKILL.md § 3.2 phase 5 — BLOCK_CHALLENGE_WINDOW timer expires with no challenge
// of the block claim. The block stands; the original action is canceled.
export function applyBlockChallengeWindowTimeout(state: GameState): GameState {
  requirePhase(state, 'BLOCK_CHALLENGE_WINDOW')
  // Block stands → action canceled → no effect → conclude turn.
  return concludeTurn(state)
}
