import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import { applyBlock, applyBlockWindowTimeout, applyBlockChallengeWindowTimeout } from '../src/blocks'
import { applyChallenge, applyChallengeWindowTimeout } from '../src/challenges'
import {
  applyAssassinate,
  applyInfluencePick,
  IllegalActionError,
} from '../src/actions'
import { DECK } from '../src/deck'
import type { GameState, ServerSeat } from '../src/state'

function seat(playerId: string, c1: CardKind, c2: CardKind, coins = 3): ServerSeat {
  return {
    playerId,
    displayName: playerId,
    coins,
    isAlive: true,
    isDisconnected: false,
    influence: [
      { status: 'face-down', kind: c1 },
      { status: 'face-down', kind: c2 },
    ],
  }
}

// p0 actor (Assassinate, claims Assassin). p1 target (may claim Contessa).
// Multiset balanced for the full 15-card DECK invariant.
function setupAssassinate(
  actorHasAssassin: boolean,
  targetHasContessa: boolean,
): GameState {
  const p0 = seat('p0', actorHasAssassin ? 'Assassin' : 'Duke', 'Captain')
  const p1 = seat('p1', targetHasContessa ? 'Contessa' : 'Ambassador', 'Duke')
  const p2 = seat('p2', 'Captain', 'Ambassador')
  // Compute the unused cards for the court deck to maintain the 15-card DECK
  // composition (3 each).
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

// --- applyAssassinate -------------------------------------------------------

describe('applyAssassinate — happy path', () => {
  it('pays 3 coins at declaration (SKILL.md § 4.4)', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    expect(state.seats[0].coins).toBe(0)
  })

  it('opens CHALLENGE_WINDOW with Assassinate pendingAction', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    expect(state.phase).toBe('CHALLENGE_WINDOW')
    expect(state.pendingAction).toStrictEqual({
      actorPlayerId: 'p0',
      action: { kind: 'Assassinate', targetPlayerId: 'p1' },
    })
  })

  it('does not yet flip the target cards', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    for (const inf of state.seats[1].influence) expect(inf.status).toBe('face-down')
  })
})

describe('applyAssassinate — rejection cases', () => {
  it('rejects when actor has <3 coins', () => {
    const state = setupAssassinate(true, true)
    state.seats[0].coins = 2
    try { applyAssassinate(state, 'p0', 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('insufficient_coins') }
  })

  it('does NOT spend coins when validation fails', () => {
    const state = setupAssassinate(true, true)
    state.seats[0].coins = 3
    try { applyAssassinate(state, 'p0', 'p0') } catch { /* self-target */ }
    expect(state.seats[0].coins).toBe(3) // unchanged
  })

  it('rejects mandatory-Coup at >=10 coins', () => {
    const state = setupAssassinate(true, true)
    state.seats[0].coins = 10
    try { applyAssassinate(state, 'p0', 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('must_coup') }
  })

  it('rejects self-target', () => {
    const state = setupAssassinate(true, true)
    try { applyAssassinate(state, 'p0', 'p0'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('cannot_target_self') }
  })

  it('rejects eliminated target', () => {
    const state = setupAssassinate(true, true)
    state.seats[1].isAlive = false
    try { applyAssassinate(state, 'p0', 'p1'); throw new Error('!') }
    catch (e) { expect((e as IllegalActionError).code).toBe('target_eliminated') }
  })
})

// --- Coins-paid-at-declaration invariant ------------------------------------

describe('Assassinate coins stay paid (SKILL.md § 4.4)', () => {
  it('coins stay paid even after disproven challenge cancels the action', () => {
    const state = setupAssassinate(false, true) // actor was bluffing
    applyAssassinate(state, 'p0', 'p1')
    expect(state.seats[0].coins).toBe(0) // paid
    applyChallenge(state, 'p1')           // disproven
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[0].coins).toBe(0) // STAYS paid
  })

  it('coins stay paid even after blocked-and-unchallenged Contessa', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Contessa')
    applyBlockChallengeWindowTimeout(state)
    expect(state.seats[0].coins).toBe(0) // STAYS paid even though target wasn't hit
  })
})

// --- Challenge paths --------------------------------------------------------

describe('Assassinate proven challenge', () => {
  it('challenger loses AND target loses (queue [challenger, target])', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    applyChallenge(state, 'p1') // p1 challenges; p0 has Assassin → proven
    expect(state.influenceLossQueue).toStrictEqual(['p1', 'p1'])
    // (challenger p1 + target p1 both equal because p1 challenged their own assassination)
    // p1 picks twice
    applyInfluencePick(state, 'p1', 0)
    expect(state.influenceLossQueue).toStrictEqual(['p1'])
    applyInfluencePick(state, 'p1', 1)
    expect(state.seats[1].isAlive).toBe(false)
  })

  it('different challenger from target: queue is [challenger, target], two players pick', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    applyChallenge(state, 'p2') // p2 (not target) challenges
    expect(state.influenceLossQueue).toStrictEqual(['p2', 'p1'])
    applyInfluencePick(state, 'p2', 0) // p2 loses first
    expect(state.influenceLossQueue).toStrictEqual(['p1'])
    applyInfluencePick(state, 'p1', 0) // p1 loses (assassinate effect)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(countByKind(allCardKinds(state))).toStrictEqual(countByKind(DECK))
  })
})

describe('Assassinate disproven challenge', () => {
  it('actor loses, target unharmed, no influence loss for target', () => {
    const state = setupAssassinate(false, true) // p0 has no Assassin
    applyAssassinate(state, 'p0', 'p1')
    applyChallenge(state, 'p2')
    expect(state.influenceLossQueue).toStrictEqual(['p0'])
    applyInfluencePick(state, 'p0', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.seats[1].influence.every((i) => i.status === 'face-down')).toBe(true)
  })
})

// --- Block paths ------------------------------------------------------------

describe('Assassinate no-challenge + no-block', () => {
  it('target loses an influence', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state) // no challenge → BLOCK_WINDOW
    expect(state.phase).toBe('BLOCK_WINDOW')
    applyBlockWindowTimeout(state) // no block → applyActionEffect → INFLUENCE_LOSS for target
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue[0]).toBe('p1')
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.seats[1].influence[0].status).toBe('revealed')
  })
})

describe('Contessa block unchallenged', () => {
  it('block stands, target unharmed, coins still paid', () => {
    const state = setupAssassinate(true, true)
    applyAssassinate(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Contessa')
    applyBlockChallengeWindowTimeout(state)
    expect(state.seats[0].coins).toBe(0) // paid
    expect(state.seats[1].influence.every((i) => i.status === 'face-down')).toBe(true)
    expect(state.phase).toBe('AWAITING_ACTION')
  })
})

describe('Contessa block proven challenge', () => {
  it('challenger (actor) loses, block stands, target unharmed', () => {
    const state = setupAssassinate(true, true) // p1 has Contessa
    applyAssassinate(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Contessa')
    applyChallenge(state, 'p0')  // actor challenges Contessa claim
    expect(state.influenceLossQueue[0]).toBe('p0') // challenger loses
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[1].influence.every((i) => i.status === 'face-down')).toBe(true)
  })
})

describe('Contessa block disproven challenge (double influence loss for target)', () => {
  it('target loses TWO influences: one from failed block, one from Assassinate', () => {
    const state = setupAssassinate(true, false) // target has no Contessa
    applyAssassinate(state, 'p0', 'p1')
    applyChallengeWindowTimeout(state)
    applyBlock(state, 'p1', 'Contessa') // bluffs
    applyChallenge(state, 'p0')          // actor challenges
    // Disproven block — blocker (p1) loses + Assassinate effect (p1 again)
    // Queue should be [p1, p1] in some order
    expect(state.influenceLossQueue).toStrictEqual(['p1', 'p1'])
    applyInfluencePick(state, 'p1', 0)
    expect(state.influenceLossQueue).toStrictEqual(['p1'])
    applyInfluencePick(state, 'p1', 1)
    expect(state.seats[1].isAlive).toBe(false) // eliminated
    expect(state.seats[1].influence.every((i) => i.status === 'revealed')).toBe(true)
  })
})
