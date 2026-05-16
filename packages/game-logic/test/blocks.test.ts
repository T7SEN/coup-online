import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import {
  applyBlock,
  applyBlockChallengeWindowTimeout,
  applyBlockWindowTimeout,
  getBlockerCharacters,
} from '../src/blocks'
import {
  applyForeignAid,
  applyInfluencePick,
  IllegalActionError,
} from '../src/actions'
import { applyChallenge } from '../src/challenges'
import { DECK } from '../src/deck'
import type { GameState, ServerSeat } from '../src/state'

// --- Fixtures ---------------------------------------------------------------

function seat(playerId: string, c1: CardKind, c2: CardKind): ServerSeat {
  return {
    playerId,
    displayName: playerId,
    coins: 2,
    isAlive: true,
    isDisconnected: false,
    eliminationOrder: null,
    influence: [
      { status: 'face-down', kind: c1 },
      { status: 'face-down', kind: c2 },
    ],
  }
}

// p0 = actor of Foreign Aid, p1 = potential blocker (claims Duke), p2 = third party.
// Court deck balanced so the full 15-card multiset is preserved when summed with hands.
function setupFA(blockerHasDuke: boolean): GameState {
  return {
    matchId: 'm1',
    phase: 'AWAITING_ACTION',
    turnIndex: 0,
    seats: [
      seat('p0', 'Assassin', 'Captain'),
      seat('p1', blockerHasDuke ? 'Duke' : 'Contessa', 'Ambassador'),
      seat('p2', 'Contessa', 'Captain'),
    ],
    courtDeck: blockerHasDuke
      ? ['Duke', 'Duke', 'Assassin', 'Assassin', 'Captain', 'Ambassador', 'Ambassador', 'Contessa', 'Contessa']
      : ['Duke', 'Duke', 'Duke', 'Assassin', 'Assassin', 'Captain', 'Ambassador', 'Ambassador', 'Contessa'],
    pendingAction: null,
    pendingBlock: null,
    timerEndsAt: null,
    influenceLossQueue: [],
    exchangePool: null,
  }
}

function countByKind(cards: readonly CardKind[]): Record<CardKind, number> {
  const counts: Record<CardKind, number> = {
    Duke: 0,
    Assassin: 0,
    Captain: 0,
    Ambassador: 0,
    Contessa: 0,
  }
  for (const c of cards) counts[c]++
  return counts
}

function allCardKinds(state: GameState): CardKind[] {
  return [
    ...state.seats.flatMap((s) => s.influence.map((i) => i.kind)),
    ...state.courtDeck,
  ]
}

// --- applyForeignAid --------------------------------------------------------

describe('applyForeignAid — happy path', () => {
  it('opens a BLOCK_WINDOW with pendingAction set (no challenge window)', () => {
    const state = setupFA(true)
    applyForeignAid(state, 'p0')
    expect(state.phase).toBe('BLOCK_WINDOW')
    expect(state.pendingAction).toStrictEqual({
      actorPlayerId: 'p0',
      action: { kind: 'ForeignAid' },
    })
  })

  it('does not yet apply the +2 coin effect', () => {
    const state = setupFA(true)
    applyForeignAid(state, 'p0')
    expect(state.seats[0].coins).toBe(2)
  })

  it('returns the same state reference (mutation contract)', () => {
    const state = setupFA(true)
    expect(applyForeignAid(state, 'p0')).toBe(state)
  })
})

describe('applyForeignAid — rejection cases', () => {
  it('rejects when phase is not AWAITING_ACTION', () => {
    const state = setupFA(true)
    state.phase = 'CHALLENGE_WINDOW'
    try {
      applyForeignAid(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it("rejects when it's not the actor's turn", () => {
    const state = setupFA(true)
    try {
      applyForeignAid(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('not_your_turn')
    }
  })

  it('rejects when actor has >=10 coins (mandatory Coup)', () => {
    const state = setupFA(true)
    state.seats[0].coins = 10
    try {
      applyForeignAid(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('must_coup')
    }
  })
})

// --- applyBlockWindowTimeout (no block) -------------------------------------

describe('applyBlockWindowTimeout — Foreign Aid resolves without block', () => {
  function mid(): GameState {
    const s = setupFA(true)
    applyForeignAid(s, 'p0')
    return s
  }

  it('applies +2 coins to the actor', () => {
    const state = mid()
    applyBlockWindowTimeout(state)
    expect(state.seats[0].coins).toBe(4)
  })

  it('advances the turn and clears pendingAction', () => {
    const state = mid()
    applyBlockWindowTimeout(state)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1)
    expect(state.pendingAction).toBeNull()
  })

  it('rejects when phase is not BLOCK_WINDOW', () => {
    const state = setupFA(true)
    try {
      applyBlockWindowTimeout(state)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it('rejects no_pending_action when BLOCK_WINDOW has no pendingAction', () => {
    const state = setupFA(true)
    state.phase = 'BLOCK_WINDOW'
    state.pendingAction = null
    try {
      applyBlockWindowTimeout(state)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_pending_action')
    }
  })
})

// --- applyBlock -------------------------------------------------------------

describe('applyBlock — happy path', () => {
  function mid(): GameState {
    const s = setupFA(true)
    applyForeignAid(s, 'p0')
    return s
  }

  it('transitions to BLOCK_CHALLENGE_WINDOW with pendingBlock set', () => {
    const state = mid()
    applyBlock(state, 'p1', 'Duke')
    expect(state.phase).toBe('BLOCK_CHALLENGE_WINDOW')
    expect(state.pendingBlock).toStrictEqual({
      blockerPlayerId: 'p1',
      claimedCharacter: 'Duke',
    })
  })

  it('does not apply the action effect on declaration', () => {
    const state = mid()
    applyBlock(state, 'p1', 'Duke')
    expect(state.seats[0].coins).toBe(2)
  })

  it('does not yet touch the blocker hand (claim is checked only on challenge)', () => {
    const state = mid()
    const before = state.seats[1].influence.map((i) => ({ ...i }))
    applyBlock(state, 'p1', 'Duke')
    expect(state.seats[1].influence).toStrictEqual(before)
  })

  it('allows any non-actor to block Foreign Aid', () => {
    const state = mid()
    // p2 (not the target — Foreign Aid has none) can block as well.
    applyBlock(state, 'p2', 'Duke')
    expect(state.pendingBlock?.blockerPlayerId).toBe('p2')
  })
})

describe('applyBlock — rejection cases', () => {
  function mid(): GameState {
    const s = setupFA(true)
    applyForeignAid(s, 'p0')
    return s
  }

  it('rejects when phase is not BLOCK_WINDOW', () => {
    const state = setupFA(true)
    try {
      applyBlock(state, 'p1', 'Duke')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it('rejects no_pending_action when BLOCK_WINDOW has no pendingAction', () => {
    const state = setupFA(true)
    state.phase = 'BLOCK_WINDOW'
    state.pendingAction = null
    try {
      applyBlock(state, 'p1', 'Duke')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_pending_action')
    }
  })

  it('rejects unknown blocker', () => {
    const state = mid()
    try {
      applyBlock(state, 'ghost', 'Duke')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('unknown_player')
    }
  })

  it('rejects when blocker is eliminated', () => {
    const state = mid()
    state.seats[1].isAlive = false
    try {
      applyBlock(state, 'p1', 'Duke')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('player_eliminated')
    }
  })

  it('rejects self-block (actor blocking their own Foreign Aid)', () => {
    const state = mid()
    try {
      applyBlock(state, 'p0', 'Duke')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('cannot_block_own_action')
    }
  })

  it('rejects invalid block character for Foreign Aid', () => {
    const state = mid()
    for (const wrong of ['Captain', 'Ambassador', 'Contessa'] as const) {
      try {
        applyBlock(state, 'p1', wrong)
        throw new Error('expected throw')
      } catch (e) {
        expect((e as IllegalActionError).code).toBe('invalid_block_character')
      }
    }
  })
})

// --- applyBlockChallengeWindowTimeout (block unchallenged → action canceled) -

describe('applyBlockChallengeWindowTimeout — block stands', () => {
  function mid(): GameState {
    const s = setupFA(true)
    applyForeignAid(s, 'p0')
    applyBlock(s, 'p1', 'Duke')
    return s
  }

  it('cancels the action and concludes the turn', () => {
    const state = mid()
    applyBlockChallengeWindowTimeout(state)
    expect(state.seats[0].coins).toBe(2) // no FA credit
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1)
    expect(state.pendingAction).toBeNull()
    expect(state.pendingBlock).toBeNull()
  })

  it('rejects when phase is not BLOCK_CHALLENGE_WINDOW', () => {
    const state = setupFA(true)
    try {
      applyBlockChallengeWindowTimeout(state)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })
})

// --- Block challenge — proven (blocker has Duke) ----------------------------

describe('applyChallenge of block — proven', () => {
  function setup(): GameState {
    const s = setupFA(true) // p1 has Duke
    applyForeignAid(s, 'p0')
    applyBlock(s, 'p1', 'Duke')
    return s
  }

  it('transitions to INFLUENCE_LOSS with the challenger as queue head', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue[0]).toBe('p0')
  })

  it('does NOT credit the +2 coins (block stands, action canceled)', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.seats[0].coins).toBe(2)
  })

  it('replaces the blocker proven card with a fresh face-down draw', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.seats[1].influence[0].status).toBe('face-down')
  })

  it('clears both pendingAction and pendingBlock', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.pendingAction).toBeNull()
    expect(state.pendingBlock).toBeNull()
  })

  it('preserves the 15-card multiset after card replacement', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('after challenger picks, turn advances with no coin gain', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    applyInfluencePick(state, 'p0', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.seats[0].coins).toBe(2)
    expect(state.seats[0].influence[0].status).toBe('revealed')
    expect(state.turnIndex).toBe(1)
  })
})

// --- Block challenge — disproven (blocker bluffed) --------------------------

describe('applyChallenge of block — disproven', () => {
  function setup(): GameState {
    const s = setupFA(false) // p1 has no Duke
    applyForeignAid(s, 'p0')
    applyBlock(s, 'p1', 'Duke')
    return s
  }

  it('transitions to INFLUENCE_LOSS with the blocker as queue head', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue[0]).toBe('p1')
  })

  it('credits the +2 coins (block failed, action resolves)', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.seats[0].coins).toBe(4)
  })

  it("does NOT touch the blocker hand on disproven (no replacement)", () => {
    const state = setup()
    const before = state.seats[1].influence.map((i) => ({ ...i }))
    applyChallenge(state, 'p0')
    expect(state.seats[1].influence).toStrictEqual(before)
  })

  it('clears both pendingAction and pendingBlock', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    expect(state.pendingAction).toBeNull()
    expect(state.pendingBlock).toBeNull()
  })

  it('after blocker picks, turn advances with +2 coins applied', () => {
    const state = setup()
    applyChallenge(state, 'p0')
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.seats[0].coins).toBe(4)
    expect(state.seats[1].influence[0].status).toBe('revealed')
    expect(state.turnIndex).toBe(1)
  })
})

// --- Block challenge — rejection cases --------------------------------------

describe('applyChallenge of block — rejection cases', () => {
  function setup(): GameState {
    const s = setupFA(true)
    applyForeignAid(s, 'p0')
    applyBlock(s, 'p1', 'Duke')
    return s
  }

  it('rejects self-challenge (blocker challenging their own block)', () => {
    const state = setup()
    try {
      applyChallenge(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('cannot_self_challenge')
    }
  })

  it('rejects unknown challenger', () => {
    const state = setup()
    try {
      applyChallenge(state, 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('unknown_player')
    }
  })

  it('rejects challenge from an eliminated player', () => {
    const state = setup()
    state.seats[2].isAlive = false
    try {
      applyChallenge(state, 'p2')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('player_eliminated')
    }
  })

  it('rejects no_pending_block when state is inconsistent', () => {
    const state = setup()
    state.pendingBlock = null
    try {
      applyChallenge(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_pending_block')
    }
  })

  it('a second challenge after the first resolves throws wrong_phase', () => {
    const state = setup()
    applyChallenge(state, 'p0') // first wins → INFLUENCE_LOSS
    try {
      applyChallenge(state, 'p2')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })
})

// --- getBlockerCharacters ---------------------------------------------------

describe('getBlockerCharacters', () => {
  it('returns the correct blockers for each blockable action', () => {
    expect(getBlockerCharacters({ kind: 'ForeignAid' })).toStrictEqual(['Duke'])
    expect(getBlockerCharacters({ kind: 'Steal', targetPlayerId: 'x' })).toStrictEqual(['Captain', 'Ambassador'])
    expect(getBlockerCharacters({ kind: 'Assassinate', targetPlayerId: 'x' })).toStrictEqual(['Contessa'])
  })

  it('returns empty array for unblockable actions', () => {
    expect(getBlockerCharacters({ kind: 'Income' })).toStrictEqual([])
    expect(getBlockerCharacters({ kind: 'Coup', targetPlayerId: 'x' })).toStrictEqual([])
    expect(getBlockerCharacters({ kind: 'Tax' })).toStrictEqual([])
    expect(getBlockerCharacters({ kind: 'Exchange' })).toStrictEqual([])
  })
})

// --- Integration ------------------------------------------------------------

describe('Foreign Aid — full sequences', () => {
  it('FA with no block: timer expires, +2 coins, turn advances', () => {
    const state = setupFA(true)
    applyForeignAid(state, 'p0')
    applyBlockWindowTimeout(state)
    expect(state.seats[0].coins).toBe(4)
    expect(state.turnIndex).toBe(1)
    expect(state.phase).toBe('AWAITING_ACTION')
  })

  it('FA with unchallenged block: block stands, no coins, turn advances', () => {
    const state = setupFA(true)
    applyForeignAid(state, 'p0')
    applyBlock(state, 'p1', 'Duke')
    applyBlockChallengeWindowTimeout(state)
    expect(state.seats[0].coins).toBe(2) // no FA
    expect(state.turnIndex).toBe(1)
    expect(state.phase).toBe('AWAITING_ACTION')
  })

  it('FA with proven block challenge: challenger loses, no coins, multiset preserved', () => {
    const state = setupFA(true)
    applyForeignAid(state, 'p0')
    applyBlock(state, 'p1', 'Duke')
    applyChallenge(state, 'p0')
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[0].coins).toBe(2)
    expect(state.seats[0].influence.some((i) => i.status === 'revealed')).toBe(true)
    expect(state.turnIndex).toBe(1)
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('FA with disproven block challenge: blocker loses, +2 coins, turn advances', () => {
    const state = setupFA(false) // p1 has no Duke
    applyForeignAid(state, 'p0')
    applyBlock(state, 'p1', 'Duke')
    applyChallenge(state, 'p0')
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[0].coins).toBe(4)
    expect(state.seats[1].influence.some((i) => i.status === 'revealed')).toBe(true)
    expect(state.turnIndex).toBe(1)
  })
})
