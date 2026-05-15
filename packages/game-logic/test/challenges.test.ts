import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import {
  applyChallenge,
  applyChallengeWindowTimeout,
  getClaimedCharacter,
} from '../src/challenges'
import { applyInfluencePick, applyTax, IllegalActionError } from '../src/actions'
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
    influence: [
      { status: 'face-down', kind: c1 },
      { status: 'face-down', kind: c2 },
    ],
  }
}

// p0 holds either Duke (provable Tax claim) or Assassin (bluff). Court-deck
// composition is balanced so the FULL 15-card multiset is preserved across
// in-hand + courtDeck — this lets the multiset-preservation tests run cleanly.
function setupTaxState(actorHasDuke: boolean): GameState {
  return {
    matchId: 'm1',
    phase: 'AWAITING_ACTION',
    turnIndex: 0,
    seats: [
      seat('p0', actorHasDuke ? 'Duke' : 'Assassin', 'Assassin'),
      seat('p1', 'Captain', 'Ambassador'),
      seat('p2', 'Contessa', 'Duke'),
    ],
    courtDeck: actorHasDuke
      ? ['Duke', 'Assassin', 'Assassin', 'Captain', 'Captain', 'Ambassador', 'Ambassador', 'Contessa', 'Contessa']
      : ['Assassin', 'Captain', 'Captain', 'Ambassador', 'Ambassador', 'Contessa', 'Contessa', 'Duke', 'Duke'],
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

// --- applyTax ---------------------------------------------------------------

describe('applyTax — happy path', () => {
  it('opens a CHALLENGE_WINDOW with pendingAction set', () => {
    const state = setupTaxState(true)
    applyTax(state, 'p0')
    expect(state.phase).toBe('CHALLENGE_WINDOW')
    expect(state.pendingAction).toStrictEqual({
      actorPlayerId: 'p0',
      action: { kind: 'Tax' },
    })
  })

  it('does not yet apply the +3 coin effect', () => {
    const state = setupTaxState(true)
    applyTax(state, 'p0')
    expect(state.seats[0].coins).toBe(2) // unchanged from starting value
  })

  it('returns the same state reference (mutation contract)', () => {
    const state = setupTaxState(true)
    expect(applyTax(state, 'p0')).toBe(state)
  })
})

describe('applyTax — rejection cases', () => {
  it('rejects when phase is not AWAITING_ACTION', () => {
    const state = setupTaxState(true)
    state.phase = 'CHALLENGE_WINDOW'
    try {
      applyTax(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it("rejects when it's not the actor's turn", () => {
    const state = setupTaxState(true)
    try {
      applyTax(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('not_your_turn')
    }
  })

  it('rejects unknown actor', () => {
    const state = setupTaxState(true)
    try {
      applyTax(state, 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('unknown_player')
    }
  })

  it('rejects when actor has >=10 coins (mandatory Coup)', () => {
    const state = setupTaxState(true)
    state.seats[0].coins = 10
    try {
      applyTax(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('must_coup')
    }
  })

  it('rejects when actor is eliminated', () => {
    const state = setupTaxState(true)
    state.seats[0].isAlive = false
    try {
      applyTax(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('player_eliminated')
    }
  })
})

// --- applyChallenge — proven (actor has Duke) -------------------------------

describe('applyChallenge — proven', () => {
  function setup(): GameState {
    const s = setupTaxState(true)
    applyTax(s, 'p0')
    return s
  }

  it('transitions to INFLUENCE_LOSS with the challenger as queue head', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue[0]).toBe('p1')
  })

  it('credits the Tax effect (+3 coins) immediately on proven resolution', () => {
    const state = setup()
    expect(state.seats[0].coins).toBe(2)
    applyChallenge(state, 'p1')
    expect(state.seats[0].coins).toBe(5)
  })

  it('replaces the claimant proven card with a fresh face-down draw', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    // The proven Duke at index 0 is gone; the new card should be face-down.
    expect(state.seats[0].influence[0].status).toBe('face-down')
  })

  it('clears pendingAction once the action is resolved', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    expect(state.pendingAction).toBeNull()
  })

  it('preserves the full 15-card multiset after card replacement', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    expect(allCardKinds(state)).toHaveLength(15)
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('after challenger picks a card, turn advances with coins credited', () => {
    const state = setup()
    applyChallenge(state, 'p1') // p1 must lose an influence
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.seats[0].coins).toBe(5) // Tax effect persists
    expect(state.seats[1].influence[0].status).toBe('revealed') // challenger lost a card
    expect(state.turnIndex).toBe(1) // next turn
  })
})

// --- applyChallenge — disproven (actor was bluffing) ------------------------

describe('applyChallenge — disproven', () => {
  function setup(): GameState {
    const s = setupTaxState(false)
    applyTax(s, 'p0')
    return s
  }

  it('transitions to INFLUENCE_LOSS with the claimant as queue head', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue[0]).toBe('p0')
  })

  it('does NOT credit the Tax effect (action canceled)', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    expect(state.seats[0].coins).toBe(2) // unchanged
  })

  it("does NOT touch the claimant's hand on disproven (no replacement)", () => {
    const state = setup()
    const before = state.seats[0].influence.map((i) => ({ ...i }))
    applyChallenge(state, 'p1')
    // Hand unchanged at this point — the influence-loss pick will reveal one card next.
    expect(state.seats[0].influence).toStrictEqual(before)
  })

  it('clears pendingAction once the action is canceled', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    expect(state.pendingAction).toBeNull()
  })

  it('after claimant picks, turn advances with no coin gain', () => {
    const state = setup()
    applyChallenge(state, 'p1')
    applyInfluencePick(state, 'p0', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.seats[0].coins).toBe(2) // no Tax credit
    expect(state.seats[0].influence[0].status).toBe('revealed') // claimant lost a card
    expect(state.turnIndex).toBe(1)
  })
})

// --- applyChallenge — rejection cases ---------------------------------------

describe('applyChallenge — rejection cases', () => {
  function setup(): GameState {
    const s = setupTaxState(true)
    applyTax(s, 'p0')
    return s
  }

  it('rejects when phase is not CHALLENGE_WINDOW', () => {
    const state = setupTaxState(true) // still in AWAITING_ACTION
    try {
      applyChallenge(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it('rejects no_pending_action when CHALLENGE_WINDOW has no pendingAction', () => {
    const state = setupTaxState(true)
    state.phase = 'CHALLENGE_WINDOW'
    state.pendingAction = null
    try {
      applyChallenge(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_pending_action')
    }
  })

  it('rejects self-challenge', () => {
    const state = setup()
    try {
      applyChallenge(state, 'p0')
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
    state.seats[1].isAlive = false
    try {
      applyChallenge(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('player_eliminated')
    }
  })

  it('after first challenge resolves, a second challenge throws wrong_phase (race tie-break)', () => {
    const state = setup()
    applyChallenge(state, 'p1') // first wins → INFLUENCE_LOSS
    try {
      applyChallenge(state, 'p2') // second sees the new phase
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })
})

// --- applyChallengeWindowTimeout --------------------------------------------

describe('applyChallengeWindowTimeout — happy path', () => {
  function setup(): GameState {
    const s = setupTaxState(true)
    applyTax(s, 'p0')
    return s
  }

  it('applies Tax +3 coins on timer expiry', () => {
    const state = setup()
    applyChallengeWindowTimeout(state)
    expect(state.seats[0].coins).toBe(5)
  })

  it('concludes the turn (phase AWAITING_ACTION, turn advances)', () => {
    const state = setup()
    applyChallengeWindowTimeout(state)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1)
  })

  it('clears pendingAction and timerEndsAt', () => {
    const state = setup()
    state.timerEndsAt = 1000
    applyChallengeWindowTimeout(state)
    expect(state.pendingAction).toBeNull()
    expect(state.timerEndsAt).toBeNull()
  })
})

describe('applyChallengeWindowTimeout — rejection cases', () => {
  it('rejects when phase is not CHALLENGE_WINDOW', () => {
    const state = setupTaxState(true)
    try {
      applyChallengeWindowTimeout(state)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it('rejects no_pending_action when CHALLENGE_WINDOW has no pendingAction', () => {
    const state = setupTaxState(true)
    state.phase = 'CHALLENGE_WINDOW'
    state.pendingAction = null
    try {
      applyChallengeWindowTimeout(state)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_pending_action')
    }
  })

  it('rejects unsupported_pending for a non-challengeable pendingAction (defensive)', () => {
    // Income / Coup / ForeignAid should never reach CHALLENGE_WINDOW — their
    // handlers don't put state there. The defensive throw catches this case if
    // a future bug ever leaks one in.
    const state = setupTaxState(true)
    state.phase = 'CHALLENGE_WINDOW'
    state.pendingAction = { actorPlayerId: 'p0', action: { kind: 'Income' } }
    try {
      applyChallengeWindowTimeout(state)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('unsupported_pending')
    }
  })

  it('transitions Steal pendingAction to BLOCK_WINDOW on timer expiry', () => {
    const state = setupTaxState(true)
    state.phase = 'CHALLENGE_WINDOW'
    state.pendingAction = { actorPlayerId: 'p0', action: { kind: 'Steal', targetPlayerId: 'p1' } }
    applyChallengeWindowTimeout(state)
    expect(state.phase).toBe('BLOCK_WINDOW')
    // Effect not yet applied — that happens at block-window timeout or proven challenge.
  })

  it('transitions Assassinate pendingAction to BLOCK_WINDOW on timer expiry', () => {
    const state = setupTaxState(true)
    state.phase = 'CHALLENGE_WINDOW'
    state.pendingAction = { actorPlayerId: 'p0', action: { kind: 'Assassinate', targetPlayerId: 'p1' } }
    applyChallengeWindowTimeout(state)
    expect(state.phase).toBe('BLOCK_WINDOW')
  })
})

// --- getClaimedCharacter ----------------------------------------------------

describe('getClaimedCharacter', () => {
  it('maps each character action to its claimed character', () => {
    expect(getClaimedCharacter({ kind: 'Tax' })).toBe('Duke')
    expect(getClaimedCharacter({ kind: 'Assassinate', targetPlayerId: 'x' })).toBe('Assassin')
    expect(getClaimedCharacter({ kind: 'Steal', targetPlayerId: 'x' })).toBe('Captain')
    expect(getClaimedCharacter({ kind: 'Exchange' })).toBe('Ambassador')
  })

  it('returns null for non-character actions', () => {
    expect(getClaimedCharacter({ kind: 'Income' })).toBeNull()
    expect(getClaimedCharacter({ kind: 'ForeignAid' })).toBeNull()
    expect(getClaimedCharacter({ kind: 'Coup', targetPlayerId: 'x' })).toBeNull()
  })
})

// --- Integration ------------------------------------------------------------

describe('Tax — full sequences', () => {
  it('Tax with no challenge: timer expires, +3 coins, turn advances', () => {
    const state = setupTaxState(true)
    applyTax(state, 'p0')
    applyChallengeWindowTimeout(state)
    expect(state.seats[0].coins).toBe(5)
    expect(state.turnIndex).toBe(1)
    expect(state.phase).toBe('AWAITING_ACTION')
  })

  it('Tax with proven challenge: challenger loses, actor gets coins, multiset preserved', () => {
    const state = setupTaxState(true)
    applyTax(state, 'p0')
    applyChallenge(state, 'p1')
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[0].coins).toBe(5)
    expect(state.seats[1].influence.some((i) => i.status === 'revealed')).toBe(true)
    expect(state.turnIndex).toBe(1)
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('Tax with disproven challenge: actor loses, no coins, multiset preserved', () => {
    const state = setupTaxState(false)
    applyTax(state, 'p0')
    applyChallenge(state, 'p1')
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[0].coins).toBe(2) // no Tax credit
    expect(state.seats[0].influence.some((i) => i.status === 'revealed')).toBe(true)
    expect(state.turnIndex).toBe(1)
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('Tax challenged by an opponent who also has Duke does not change the outcome', () => {
    // p2 also has Duke (per the proven fixture). They challenge p0's Tax. p0
    // proves Duke and p2 must still lose an influence — having Duke yourself
    // doesn't immunize you against losing the challenge.
    const state = setupTaxState(true)
    applyTax(state, 'p0')
    applyChallenge(state, 'p2')
    expect(state.influenceLossQueue[0]).toBe('p2')
    expect(state.seats[0].coins).toBe(5)
  })
})
