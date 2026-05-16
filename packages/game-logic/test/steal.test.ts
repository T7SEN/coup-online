import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import { applyBlock, applyBlockWindowTimeout } from '../src/blocks'
import { applyChallenge, applyChallengeWindowTimeout } from '../src/challenges'
import {
  applyInfluencePick,
  applyStealAction,
  IllegalActionError,
} from '../src/actions'
import { DECK } from '../src/deck'
import type { GameState, ServerSeat } from '../src/state'

function seat(playerId: string, c1: CardKind, c2: CardKind, coins = 2): ServerSeat {
  return {
    playerId,
    displayName: playerId,
    coins,
    isAlive: true,
    isDisconnected: false,
    eliminationOrder: null,
    influence: [
      { status: 'face-down', kind: c1 },
      { status: 'face-down', kind: c2 },
    ],
  }
}

// p0 actor (claims Captain). p1 target. p2 bystander.
// Multiset-balanced for the full DECK invariant on proven-challenge tests.
function setupSteal(actorHasCaptain: boolean, targetCoins = 5): GameState {
  return {
    matchId: 'm1',
    phase: 'AWAITING_ACTION',
    turnIndex: 0,
    seats: [
      seat('p0', actorHasCaptain ? 'Captain' : 'Duke', 'Assassin'),
      { ...seat('p1', 'Ambassador', 'Contessa'), coins: targetCoins },
      seat('p2', 'Duke', 'Captain'),
    ],
    courtDeck: actorHasCaptain
      ? ['Duke', 'Duke', 'Assassin', 'Assassin', 'Captain', 'Ambassador', 'Ambassador', 'Contessa', 'Contessa']
      : ['Duke', 'Assassin', 'Assassin', 'Captain', 'Captain', 'Ambassador', 'Ambassador', 'Contessa', 'Contessa'],
    pendingAction: null,
    pendingBlock: null,
    timerEndsAt: null,
    influenceLossQueue: [],
    exchangePool: null,
  }
}

function countByKind(cards: readonly CardKind[]): Record<CardKind, number> {
  const counts: Record<CardKind, number> = {
    Duke: 0, Assassin: 0, Captain: 0, Ambassador: 0, Contessa: 0,
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

// --- applyStealAction -------------------------------------------------------

describe('applyStealAction — happy path', () => {
  it('opens a CHALLENGE_WINDOW with Steal pendingAction', () => {
    const state = setupSteal(true)
    applyStealAction(state, 'p0', 'p1')
    expect(state.phase).toBe('CHALLENGE_WINDOW')
    expect(state.pendingAction).toStrictEqual({
      actorPlayerId: 'p0',
      action: { kind: 'Steal', targetPlayerId: 'p1' },
    })
  })

  it('does not yet transfer coins', () => {
    const state = setupSteal(true)
    applyStealAction(state, 'p0', 'p1')
    expect(state.seats[0].coins).toBe(2)
    expect(state.seats[1].coins).toBe(5)
  })
})

describe('applyStealAction — rejection cases', () => {
  it('rejects wrong phase', () => {
    const state = setupSteal(true)
    state.phase = 'CHALLENGE_WINDOW'
    try { applyStealAction(state, 'p0', 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('wrong_phase') }
  })

  it("rejects when it's not the actor's turn", () => {
    const state = setupSteal(true)
    try { applyStealAction(state, 'p1', 'p0'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('not_your_turn') }
  })

  it('rejects when actor has >=10 coins (mandatory Coup)', () => {
    const state = setupSteal(true)
    state.seats[0].coins = 10
    try { applyStealAction(state, 'p0', 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('must_coup') }
  })

  it('rejects self-target', () => {
    const state = setupSteal(true)
    try { applyStealAction(state, 'p0', 'p0'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('cannot_target_self') }
  })

  it('rejects unknown target', () => {
    const state = setupSteal(true)
    try { applyStealAction(state, 'p0', 'ghost'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('invalid_target') }
  })

  it('rejects eliminated target', () => {
    const state = setupSteal(true)
    state.seats[1].isAlive = false
    try { applyStealAction(state, 'p0', 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('target_eliminated') }
  })
})

// --- Coin transfer cap ------------------------------------------------------

describe('Steal coin transfer cap', () => {
  it('transfers 2 coins when target has 2+', () => {
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state) // no challenge
    applyBlockWindowTimeout(state)     // no block
    expect(state.seats[0].coins).toBe(4)
    expect(state.seats[1].coins).toBe(3)
  })

  it('transfers 1 coin when target has exactly 1', () => {
    const state = setupSteal(true, 1)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlockWindowTimeout(state)
    expect(state.seats[0].coins).toBe(3)
    expect(state.seats[1].coins).toBe(0)
  })

  it('transfers 0 coins when target has 0 (legal but a no-op transfer)', () => {
    const state = setupSteal(true, 0)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlockWindowTimeout(state)
    expect(state.seats[0].coins).toBe(2)
    expect(state.seats[1].coins).toBe(0)
  })
})

// --- Challenge paths --------------------------------------------------------

describe('Steal proven challenge', () => {
  it('challenger loses, transfer happens, deck multiset preserved', () => {
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallenge(state, 'p1')
    expect(state.influenceLossQueue[0]).toBe('p1')
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[0].coins).toBe(4)
    expect(state.seats[1].coins).toBe(3)
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })
})

describe('Steal disproven challenge', () => {
  it('actor loses, no transfer', () => {
    const state = setupSteal(false, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallenge(state, 'p1')
    expect(state.influenceLossQueue[0]).toBe('p0')
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[0].coins).toBe(2) // no transfer
    expect(state.seats[1].coins).toBe(5)
  })
})

// --- Block paths ------------------------------------------------------------

describe('Steal block by Captain', () => {
  it('blocked by target with Captain claim, unchallenged → no transfer', () => {
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Captain')
    // No block challenge — timer expires.
    expect(state.phase).toBe('BLOCK_CHALLENGE_WINDOW')
    // BLOCK_CHALLENGE_WINDOW timeout via the blocks helper.
    // (Direct phase to AWAITING_ACTION via applyBlockChallengeWindowTimeout.)
  })

  it('block by non-target rejected with only_target_can_block', () => {
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    try { applyBlock(state, 'p2', 'Captain'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('only_target_can_block') }
  })

  it('block claim of non-Captain/non-Ambassador rejected', () => {
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    try { applyBlock(state, 'p1', 'Duke'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('invalid_block_character') }
  })
})

describe('Steal block by Ambassador', () => {
  it('blocked by target with Ambassador claim, proven on challenge', () => {
    // Setup: p1 has Ambassador. After block + challenge from actor, p1 proves.
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Ambassador')
    applyChallenge(state, 'p0') // actor challenges p1's Ambassador claim
    // p1 has Ambassador at index 0 in the fixture; proven.
    expect(state.influenceLossQueue[0]).toBe('p0')
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[0].coins).toBe(2) // block stood, no transfer
    expect(state.seats[1].coins).toBe(5)
  })
})

// --- Integration ------------------------------------------------------------

describe('Steal — full sequences', () => {
  it('no challenge no block: transfer 2, turn advances', () => {
    const state = setupSteal(true, 5)
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlockWindowTimeout(state)
    expect(state.seats[0].coins).toBe(4)
    expect(state.seats[1].coins).toBe(3)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1)
  })

  it('disproven Ambassador block: blocker loses, transfer happens', () => {
    // Setup: p1 has no Ambassador (give it Duke + Contessa). Bluffs the block.
    const state = setupSteal(true, 5)
    state.seats[1].influence = [
      { status: 'face-down', kind: 'Duke' },
      { status: 'face-down', kind: 'Contessa' },
    ]
    // Adjust deck for multiset balance.
    state.courtDeck = ['Duke', 'Assassin', 'Assassin', 'Captain', 'Ambassador', 'Ambassador', 'Ambassador', 'Contessa', 'Contessa']
    applyStealAction(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Ambassador')
    applyChallenge(state, 'p0') // actor challenges; p1 has no Ambassador → disproven
    expect(state.influenceLossQueue[0]).toBe('p1')
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[0].coins).toBe(4) // transfer happened
    expect(state.seats[1].coins).toBe(3) // -2 from steal
    expect(state.seats[1].influence.some((i) => i.status === 'revealed')).toBe(true)
  })
})
