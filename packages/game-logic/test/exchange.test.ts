import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import { applyChallenge, applyChallengeWindowTimeout } from '../src/challenges'
import {
  applyExchange,
  applyExchangePick,
  applyExchangeTimeout,
  applyInfluencePick,
  IllegalActionError,
} from '../src/actions'
import { DECK } from '../src/deck'
import type { GameState, ServerSeat } from '../src/state'

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

// p0 actor (Exchange, claims Ambassador).
function setupExchange(actorHasAmbassador: boolean): GameState {
  const p0 = seat('p0', actorHasAmbassador ? 'Ambassador' : 'Duke', 'Captain')
  const p1 = seat('p1', 'Assassin', 'Contessa')
  const p2 = seat('p2', 'Duke', 'Captain')
  const used: CardKind[] = [
    p0.influence[0].kind, p0.influence[1].kind,
    p1.influence[0].kind, p1.influence[1].kind,
    p2.influence[0].kind, p2.influence[1].kind,
  ]
  const target: Record<CardKind, number> = { Duke: 3, Assassin: 3, Captain: 3, Ambassador: 3, Contessa: 3 }
  for (const u of used) target[u]--
  const courtDeck: CardKind[] = []
  for (const k of Object.keys(target) as CardKind[]) {
    for (let i = 0; i < target[k]; i++) courtDeck.push(k)
  }
  return {
    matchId: 'm1',
    phase: 'AWAITING_ACTION',
    turnIndex: 0,
    seats: [p0, p1, p2],
    courtDeck,
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

// --- applyExchange ----------------------------------------------------------

describe('applyExchange — happy path', () => {
  it('opens a CHALLENGE_WINDOW with Exchange pendingAction', () => {
    const state = setupExchange(true)
    applyExchange(state, 'p0')
    expect(state.phase).toBe('CHALLENGE_WINDOW')
    expect(state.pendingAction).toStrictEqual({
      actorPlayerId: 'p0',
      action: { kind: 'Exchange' },
    })
  })

  it('does not yet set up exchangePool', () => {
    const state = setupExchange(true)
    applyExchange(state, 'p0')
    expect(state.exchangePool).toBeNull()
  })
})

describe('applyExchange — rejection cases', () => {
  it('rejects wrong phase', () => {
    const state = setupExchange(true)
    state.phase = 'BLOCK_WINDOW'
    try { applyExchange(state, 'p0'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('wrong_phase') }
  })

  it("rejects when it's not the actor's turn", () => {
    const state = setupExchange(true)
    try { applyExchange(state, 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('not_your_turn') }
  })

  it('rejects mandatory-Coup at >=10 coins', () => {
    const state = setupExchange(true)
    state.seats[0].coins = 10
    try { applyExchange(state, 'p0'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('must_coup') }
  })
})

// --- No challenge: enters EXCHANGE_SELECTION --------------------------------

describe('applyChallengeWindowTimeout for Exchange', () => {
  it('sets up exchangePool and enters EXCHANGE_SELECTION', () => {
    const state = setupExchange(true)
    applyExchange(state, 'p0')
    applyChallengeWindowTimeout(state)
    expect(state.phase).toBe('EXCHANGE_SELECTION')
    expect(state.exchangePool).not.toBeNull()
    expect(state.exchangePool!.actorPlayerId).toBe('p0')
    expect(state.exchangePool!.cards).toHaveLength(4)
  })

  it('the pool contains the actor face-down cards + 2 drawn', () => {
    const state = setupExchange(true)
    const ownCards = state.seats[0].influence.map((i) => i.kind)
    applyExchange(state, 'p0')
    applyChallengeWindowTimeout(state)
    // First two pool entries should be the actor's own face-down cards.
    expect(state.exchangePool!.cards[0]).toBe(ownCards[0])
    expect(state.exchangePool!.cards[1]).toBe(ownCards[1])
  })

  it('removes 2 cards from court deck (drawn into the pool)', () => {
    const state = setupExchange(true)
    const beforeLen = state.courtDeck.length
    applyExchange(state, 'p0')
    applyChallengeWindowTimeout(state)
    expect(state.courtDeck.length).toBe(beforeLen - 2)
  })
})

// --- Challenge paths --------------------------------------------------------

describe('Exchange proven challenge', () => {
  it('challenger picks first, then EXCHANGE_SELECTION opens', () => {
    const state = setupExchange(true)
    applyExchange(state, 'p0')
    applyChallenge(state, 'p1')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue[0]).toBe('p1')
    expect(state.exchangePool).not.toBeNull()
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('EXCHANGE_SELECTION')
    expect(state.exchangePool!.actorPlayerId).toBe('p0')
  })
})

describe('Exchange disproven challenge', () => {
  it('actor loses, no exchange happens', () => {
    const state = setupExchange(false)
    applyExchange(state, 'p0')
    applyChallenge(state, 'p1')
    expect(state.influenceLossQueue[0]).toBe('p0')
    expect(state.exchangePool).toBeNull()
    applyInfluencePick(state, 'p0', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
  })
})

// --- applyExchangePick ------------------------------------------------------

describe('applyExchangePick — happy path', () => {
  function mid(): GameState {
    const s = setupExchange(true)
    applyExchange(s, 'p0')
    applyChallengeWindowTimeout(s)
    return s
  }

  it('keeping original cards [0, 1] leaves hand unchanged', () => {
    const state = mid()
    const before = state.seats[0].influence.map((i) => ({ ...i }))
    applyExchangePick(state, 'p0', [0, 1])
    expect(state.seats[0].influence).toStrictEqual(before)
  })

  it('keeping drawn cards [2, 3] replaces hand with drawn cards', () => {
    const state = mid()
    const drawn = [state.exchangePool!.cards[2], state.exchangePool!.cards[3]]
    applyExchangePick(state, 'p0', [2, 3])
    expect(state.seats[0].influence[0]).toStrictEqual({ status: 'face-down', kind: drawn[0] })
    expect(state.seats[0].influence[1]).toStrictEqual({ status: 'face-down', kind: drawn[1] })
  })

  it('preserves the 15-card multiset', () => {
    const state = mid()
    applyExchangePick(state, 'p0', [0, 2])
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('clears exchangePool and concludes the turn', () => {
    const state = mid()
    applyExchangePick(state, 'p0', [0, 1])
    expect(state.exchangePool).toBeNull()
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1)
  })

  it('returns 2 cards back to the court deck (court deck size unchanged net)', () => {
    const state = mid()
    const beforePoolDeck = state.courtDeck.length // after drawing 2, deck is shorter
    applyExchangePick(state, 'p0', [0, 1])
    expect(state.courtDeck.length).toBe(beforePoolDeck + 2)
  })
})

describe('applyExchangePick — rejection cases', () => {
  function mid(): GameState {
    const s = setupExchange(true)
    applyExchange(s, 'p0')
    applyChallengeWindowTimeout(s)
    return s
  }

  it('rejects wrong phase', () => {
    const state = setupExchange(true)
    try { applyExchangePick(state, 'p0', [0, 1]); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('wrong_phase') }
  })

  it('rejects when there is no exchangePool', () => {
    const state = setupExchange(true)
    state.phase = 'EXCHANGE_SELECTION'
    try { applyExchangePick(state, 'p0', [0, 1]); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('no_exchange_pool') }
  })

  it('rejects when a non-actor tries to pick', () => {
    const state = mid()
    try { applyExchangePick(state, 'p1', [0, 1]); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('not_your_exchange') }
  })

  it('rejects wrong-length keepIndices', () => {
    const state = mid()
    try { applyExchangePick(state, 'p0', [0]); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('invalid_keep_indices') }
    try { applyExchangePick(state, 'p0', [0, 1, 2]); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('invalid_keep_indices') }
  })

  it('rejects out-of-range indices', () => {
    const state = mid()
    for (const bad of [[-1, 0], [0, 4], [99, 0], [0, 1.5]]) {
      try { applyExchangePick(state, 'p0', bad); throw new Error('!') }
      catch (e) { expect((e as IllegalActionError).code).toBe('invalid_keep_indices') }
    }
  })

  it('rejects duplicate indices', () => {
    const state = mid()
    try { applyExchangePick(state, 'p0', [0, 0]); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('duplicate_keep_indices') }
  })
})

// --- applyExchangeTimeout ---------------------------------------------------

describe('applyExchangeTimeout', () => {
  function mid(): GameState {
    const s = setupExchange(true)
    applyExchange(s, 'p0')
    applyChallengeWindowTimeout(s)
    return s
  }

  it('auto-keeps the actor original cards [0, 1] (info-preserving default)', () => {
    const state = mid()
    const before = state.seats[0].influence.map((i) => ({ ...i }))
    applyExchangeTimeout(state, 'p0')
    expect(state.seats[0].influence).toStrictEqual(before)
    expect(state.phase).toBe('AWAITING_ACTION')
  })
})

// --- exchange_requires_two_cards edge --------------------------------------

describe('Exchange — one-influence edge case', () => {
  it('rejects Exchange when actor has only 1 face-down card (v1 limitation)', () => {
    const state = setupExchange(true)
    state.seats[0].influence[1] = { status: 'revealed', kind: 'Captain' }
    applyExchange(state, 'p0')
    try { applyChallengeWindowTimeout(state); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('exchange_requires_two_cards') }
  })
})

// --- Integration ------------------------------------------------------------

describe('Exchange — full sequences', () => {
  it('no challenge: pool set, pick original cards, turn advances', () => {
    const state = setupExchange(true)
    applyExchange(state, 'p0')
    applyChallengeWindowTimeout(state)
    applyExchangePick(state, 'p0', [0, 1])
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1)
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })

  it('proven challenge: challenger loses, then actor picks via exchange', () => {
    const state = setupExchange(true)
    applyExchange(state, 'p0')
    applyChallenge(state, 'p1')
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('EXCHANGE_SELECTION')
    applyExchangePick(state, 'p0', [0, 1])
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })
})
