import { describe, expect, it } from 'vitest'
import {
  applyCoup,
  applyIncome,
  applyInfluencePick,
  applyInfluenceTimeout,
  concludeTurn,
  IllegalActionError,
} from '../src/actions'
import type { GameState, ServerSeat } from '../src/state'

// Deterministic 3-player state — turn=p0, all alive, no pending state.
// Each seat starts at 2 coins per SKILL.md § 4.2.
function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    matchId: 'm1',
    phase: 'AWAITING_ACTION',
    turnIndex: 0,
    seats: [
      makeSeat('p0', 'Alice'),
      makeSeat('p1', 'Bob'),
      makeSeat('p2', 'Charlie'),
    ],
    courtDeck: ['Duke', 'Captain', 'Ambassador'],
    pendingAction: null,
    pendingBlock: null,
    timerEndsAt: null,
    influenceLossQueue: [],
    exchangePool: null,
    ...overrides,
  }
}

function makeSeat(playerId: string, displayName: string): ServerSeat {
  return {
    playerId,
    displayName,
    coins: 2,
    isAlive: true,
    isDisconnected: false,
    eliminationOrder: null,
    influence: [
      { status: 'face-down', kind: 'Duke' },
      { status: 'face-down', kind: 'Assassin' },
    ],
  }
}

describe('applyIncome — happy path', () => {
  it('adds 1 coin to the actor', () => {
    const state = makeState()
    applyIncome(state, 'p0')
    expect(state.seats[0].coins).toBe(3)
  })

  it('does not change other players coins', () => {
    const state = makeState()
    applyIncome(state, 'p0')
    expect(state.seats[1].coins).toBe(2)
    expect(state.seats[2].coins).toBe(2)
  })

  it('advances turnIndex to the next seat', () => {
    const state = makeState()
    applyIncome(state, 'p0')
    expect(state.turnIndex).toBe(1)
  })

  it('returns the same state reference (mutation, not copy)', () => {
    const state = makeState()
    const returned = applyIncome(state, 'p0')
    expect(returned).toBe(state)
  })

  it('phase remains AWAITING_ACTION after resolution (TURN_END is transient)', () => {
    const state = makeState()
    applyIncome(state, 'p0')
    expect(state.phase).toBe('AWAITING_ACTION')
  })

  it('does not touch courtDeck or influence', () => {
    const state = makeState()
    const deckBefore = [...state.courtDeck]
    const p0InfluenceBefore = state.seats[0].influence.map((i) => ({ ...i }))
    applyIncome(state, 'p0')
    expect(state.courtDeck).toStrictEqual(deckBefore)
    expect(state.seats[0].influence).toStrictEqual(p0InfluenceBefore)
  })

  it('clears any leftover pending state and timer', () => {
    // The DO would have cleared these by phase-change anyway, but concludeTurn
    // defensively resets them.
    const state = makeState({
      pendingAction: { actorPlayerId: 'p0', action: { kind: 'Income' } },
      pendingBlock: { blockerPlayerId: 'p1', claimedCharacter: 'Duke' },
      timerEndsAt: 1234,
    })
    applyIncome(state, 'p0')
    expect(state.pendingAction).toBeNull()
    expect(state.pendingBlock).toBeNull()
    expect(state.timerEndsAt).toBeNull()
  })
})

describe('applyIncome — rejection cases', () => {
  it('rejects when phase is not AWAITING_ACTION', () => {
    const state = makeState({ phase: 'CHALLENGE_WINDOW' })
    expect(() => applyIncome(state, 'p0')).toThrow(IllegalActionError)
    try {
      applyIncome(state, 'p0')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it("rejects when it's not the actor's turn", () => {
    const state = makeState() // turn=p0
    try {
      applyIncome(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError)
      expect((e as IllegalActionError).code).toBe('not_your_turn')
    }
  })

  it('rejects unknown playerId', () => {
    const state = makeState()
    try {
      applyIncome(state, 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError)
      expect((e as IllegalActionError).code).toBe('unknown_player')
    }
  })

  it('rejects when the actor is eliminated (defensive — should never happen)', () => {
    // Simulate a state inconsistency: turn-holder marked dead.
    const state = makeState()
    state.seats[0].isAlive = false
    try {
      applyIncome(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError)
      expect((e as IllegalActionError).code).toBe('player_eliminated')
    }
  })

  it('rejects when actor has >=10 coins (mandatory Coup, SKILL.md § 4.9)', () => {
    const state = makeState()
    state.seats[0].coins = 10
    try {
      applyIncome(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError)
      expect((e as IllegalActionError).code).toBe('must_coup')
    }
  })

  it('still rejects at 11 and 12 coins (>=10 is the threshold)', () => {
    for (const coins of [11, 12, 25]) {
      const state = makeState()
      state.seats[0].coins = coins
      expect(() => applyIncome(state, 'p0')).toThrow(IllegalActionError)
    }
  })

  it('allows the action at 9 coins (boundary check)', () => {
    const state = makeState()
    state.seats[0].coins = 9
    expect(() => applyIncome(state, 'p0')).not.toThrow()
    expect(state.seats[0].coins).toBe(10)
    // Note: now the player has 10 coins. Their NEXT turn they must Coup. But the
    // Income they just did was legal (the threshold is checked at action time on
    // the pre-action coin count).
  })
})

describe('turn advancement', () => {
  it('skips eliminated players', () => {
    const state = makeState({ turnIndex: 0 })
    state.seats[1].isAlive = false // p1 is dead
    applyIncome(state, 'p0')
    expect(state.turnIndex).toBe(2) // skip to p2
  })

  it('wraps around the seat array', () => {
    const state = makeState({ turnIndex: 2 })
    applyIncome(state, 'p2')
    expect(state.turnIndex).toBe(0) // wraps to p0
  })

  it('skips multiple eliminated players in a row', () => {
    const state = makeState({ turnIndex: 0 })
    state.seats[1].isAlive = false
    state.seats[2].isAlive = false
    applyIncome(state, 'p0')
    // Only p0 alive — falls back to p0 (game-over guard happens elsewhere).
    expect(state.turnIndex).toBe(0)
  })

  it('handles a multi-step turn sequence', () => {
    const state = makeState()
    applyIncome(state, 'p0')
    expect(state.turnIndex).toBe(1)
    expect(state.seats[0].coins).toBe(3)
    applyIncome(state, 'p1')
    expect(state.turnIndex).toBe(2)
    expect(state.seats[1].coins).toBe(3)
    applyIncome(state, 'p2')
    expect(state.turnIndex).toBe(0) // back to p0
    expect(state.seats[2].coins).toBe(3)
  })
})

describe('concludeTurn', () => {
  it('clears pendingAction, pendingBlock, timerEndsAt, influenceLossQueue, exchangePool', () => {
    const state = makeState({
      pendingAction: { actorPlayerId: 'p0', action: { kind: 'Tax' } },
      pendingBlock: { blockerPlayerId: 'p1', claimedCharacter: 'Duke' },
      timerEndsAt: 9_999,
      influenceLossQueue: ['p2', 'p1'],
      exchangePool: { actorPlayerId: 'p0', cards: ['Duke', 'Assassin', 'Captain', 'Ambassador'] },
    })
    concludeTurn(state)
    expect(state.pendingAction).toBeNull()
    expect(state.pendingBlock).toBeNull()
    expect(state.timerEndsAt).toBeNull()
    expect(state.influenceLossQueue).toStrictEqual([])
    expect(state.exchangePool).toBeNull()
  })

  it('sets phase to AWAITING_ACTION regardless of starting phase', () => {
    const state = makeState({ phase: 'INFLUENCE_LOSS' })
    concludeTurn(state)
    expect(state.phase).toBe('AWAITING_ACTION')
  })

  it('advances to the next living seat from the current turnIndex', () => {
    const state = makeState({ turnIndex: 1 })
    concludeTurn(state)
    expect(state.turnIndex).toBe(2)
  })

  it('transitions to GAME_OVER when only one player is alive', () => {
    const state = makeState({ turnIndex: 0 })
    state.seats[1].isAlive = false
    state.seats[2].isAlive = false
    concludeTurn(state)
    expect(state.phase).toBe('GAME_OVER')
  })

  it('does not advance turnIndex when transitioning to GAME_OVER', () => {
    const state = makeState({ turnIndex: 0 })
    state.seats[1].isAlive = false
    state.seats[2].isAlive = false
    concludeTurn(state)
    expect(state.turnIndex).toBe(0) // unchanged; winner is whoever isAlive
  })
})

// --- Coup -------------------------------------------------------------------

describe('applyCoup — happy path', () => {
  it('pays 7 coins from the actor', () => {
    const state = makeState()
    state.seats[0].coins = 7
    applyCoup(state, 'p0', 'p1')
    expect(state.seats[0].coins).toBe(0)
  })

  it('does not immediately reveal the target cards (waits for pick)', () => {
    const state = makeState()
    state.seats[0].coins = 7
    applyCoup(state, 'p0', 'p1')
    for (const inf of state.seats[1].influence) {
      expect(inf.status).toBe('face-down')
    }
    expect(state.seats[1].isAlive).toBe(true)
  })

  it('transitions to INFLUENCE_LOSS with pendingAction and queues target', () => {
    const state = makeState()
    state.seats[0].coins = 7
    applyCoup(state, 'p0', 'p1')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.pendingAction).toStrictEqual({
      actorPlayerId: 'p0',
      action: { kind: 'Coup', targetPlayerId: 'p1' },
    })
    expect(state.influenceLossQueue).toStrictEqual(['p1'])
  })

  it('returns the same state reference (mutation, not copy)', () => {
    const state = makeState()
    state.seats[0].coins = 7
    expect(applyCoup(state, 'p0', 'p1')).toBe(state)
  })

  it('is legal at exactly 7 coins (boundary)', () => {
    const state = makeState()
    state.seats[0].coins = 7
    expect(() => applyCoup(state, 'p0', 'p1')).not.toThrow()
  })

  it('is allowed (not rejected) at >=10 coins — mandatory-Coup is exactly this action', () => {
    const state = makeState()
    state.seats[0].coins = 12
    expect(() => applyCoup(state, 'p0', 'p1')).not.toThrow()
    expect(state.seats[0].coins).toBe(5)
  })
})

describe('applyCoup — rejection cases', () => {
  it('rejects when phase is not AWAITING_ACTION', () => {
    const state = makeState({ phase: 'CHALLENGE_WINDOW' })
    state.seats[0].coins = 7
    try {
      applyCoup(state, 'p0', 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError)
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it("rejects when it's not the actor's turn", () => {
    const state = makeState({ turnIndex: 1 })
    state.seats[0].coins = 7
    try {
      applyCoup(state, 'p0', 'p2')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalActionError)
      expect((e as IllegalActionError).code).toBe('not_your_turn')
    }
  })

  it('rejects unknown actor', () => {
    const state = makeState()
    try {
      applyCoup(state, 'ghost', 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('unknown_player')
    }
  })

  it('rejects when actor is eliminated', () => {
    const state = makeState()
    state.seats[0].coins = 7
    state.seats[0].isAlive = false
    try {
      applyCoup(state, 'p0', 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('player_eliminated')
    }
  })

  it('rejects when actor has <7 coins', () => {
    for (const coins of [0, 1, 6]) {
      const state = makeState()
      state.seats[0].coins = coins
      try {
        applyCoup(state, 'p0', 'p1')
        throw new Error('expected throw')
      } catch (e) {
        expect(e).toBeInstanceOf(IllegalActionError)
        expect((e as IllegalActionError).code).toBe('insufficient_coins')
      }
    }
  })

  it('rejects targeting self', () => {
    const state = makeState()
    state.seats[0].coins = 7
    try {
      applyCoup(state, 'p0', 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('cannot_target_self')
    }
  })

  it('rejects unknown target', () => {
    const state = makeState()
    state.seats[0].coins = 7
    try {
      applyCoup(state, 'p0', 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('invalid_target')
    }
  })

  it('rejects targeting an already-eliminated player', () => {
    const state = makeState()
    state.seats[0].coins = 7
    state.seats[1].isAlive = false
    try {
      applyCoup(state, 'p0', 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('target_eliminated')
    }
  })

  it('does NOT spend coins when validation fails', () => {
    const state = makeState()
    state.seats[0].coins = 7
    try {
      applyCoup(state, 'p0', 'p0') // self-target → reject
    } catch {
      /* expected */
    }
    expect(state.seats[0].coins).toBe(7)
    expect(state.phase).toBe('AWAITING_ACTION')
  })
})

// --- Influence pick ---------------------------------------------------------

describe('applyInfluencePick — happy path', () => {
  function stateMidCoup(): GameState {
    const s = makeState()
    s.seats[0].coins = 7
    applyCoup(s, 'p0', 'p1')
    return s // now in INFLUENCE_LOSS waiting for p1 to pick
  }

  it('flips the chosen card to revealed', () => {
    const state = stateMidCoup()
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[1].influence[0]).toStrictEqual({ status: 'revealed', kind: 'Duke' })
  })

  it('leaves the other card face-down', () => {
    const state = stateMidCoup()
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[1].influence[1].status).toBe('face-down')
    expect(state.seats[1].isAlive).toBe(true)
  })

  it('advances the turn after pick (target still alive)', () => {
    const state = stateMidCoup()
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1) // p1 still alive → next is p1
  })

  it('clears pendingAction after pick', () => {
    const state = stateMidCoup()
    applyInfluencePick(state, 'p1', 0)
    expect(state.pendingAction).toBeNull()
  })

  it('eliminates the target when both cards become revealed', () => {
    const state = stateMidCoup()
    // Pre-reveal one of p1's cards so the next pick is the second.
    state.seats[1].influence[1] = { status: 'revealed', kind: 'Assassin' }
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[1].influence.every((i) => i.status === 'revealed')).toBe(true)
    expect(state.seats[1].isAlive).toBe(false)
  })

  it('stamps eliminationOrder when the pick eliminates the player', () => {
    const state = stateMidCoup()
    expect(state.seats[1].eliminationOrder).toBeNull()
    state.seats[1].influence[1] = { status: 'revealed', kind: 'Assassin' }
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[1].isAlive).toBe(false)
    expect(state.seats[1].eliminationOrder).toBe(1) // first (only) elimination
  })

  it('leaves eliminationOrder null on a non-eliminating pick', () => {
    const state = stateMidCoup()
    applyInfluencePick(state, 'p1', 0) // p1 still has one face-down card
    expect(state.seats[1].isAlive).toBe(true)
    expect(state.seats[1].eliminationOrder).toBeNull()
  })

  it('skips the eliminated target in turn advance', () => {
    const state = stateMidCoup()
    state.seats[1].influence[1] = { status: 'revealed', kind: 'Assassin' }
    applyInfluencePick(state, 'p1', 0)
    expect(state.turnIndex).toBe(2) // skip eliminated p1
  })

  it('ends the game when elimination drops to one survivor', () => {
    // 3-player game; pre-eliminate p2 outside the action flow, then Coup p0 -> p1.
    const state = makeState()
    state.seats[0].coins = 7
    state.seats[2].isAlive = false
    state.seats[2].influence = [
      { status: 'revealed', kind: 'Duke' },
      { status: 'revealed', kind: 'Assassin' },
    ]
    applyCoup(state, 'p0', 'p1')
    // p1 about to lose; pre-reveal one card so the pick eliminates them.
    state.seats[1].influence[1] = { status: 'revealed', kind: 'Assassin' }
    applyInfluencePick(state, 'p1', 0)
    expect(state.phase).toBe('GAME_OVER')
    expect(state.seats[1].isAlive).toBe(false)
    // Winner is p0 (only alive). Tests of who-the-winner-is live in
    // win-condition.test.ts; here we just confirm the phase transition.
  })
})

describe('applyInfluencePick — rejection cases', () => {
  function mid(): GameState {
    const s = makeState()
    s.seats[0].coins = 7
    applyCoup(s, 'p0', 'p1')
    return s
  }

  it('rejects when phase is not INFLUENCE_LOSS', () => {
    const state = makeState()
    try {
      applyInfluencePick(state, 'p0', 0)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it('rejects when a non-target player tries to pick', () => {
    const state = mid()
    try {
      applyInfluencePick(state, 'p0', 0)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('not_your_pick')
    }
  })

  it('rejects out-of-range cardIndex', () => {
    const state = mid()
    for (const bad of [-1, 2, 99, 1.5]) {
      try {
        applyInfluencePick(state, 'p1', bad)
        throw new Error('expected throw')
      } catch (e) {
        expect((e as IllegalActionError).code).toBe('invalid_card_index')
      }
    }
  })

  it('rejects picking an already-revealed card', () => {
    const state = mid()
    state.seats[1].influence[0] = { status: 'revealed', kind: 'Duke' }
    try {
      applyInfluencePick(state, 'p1', 0)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('card_already_revealed')
    }
  })

  it('rejects with no_loss_target if INFLUENCE_LOSS has an empty queue', () => {
    const state = makeState({ phase: 'INFLUENCE_LOSS', influenceLossQueue: [] })
    try {
      applyInfluencePick(state, 'p0', 0)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_loss_target')
    }
  })
})

// --- Influence-timeout ------------------------------------------------------

describe('applyInfluenceTimeout', () => {
  function mid(): GameState {
    const s = makeState()
    s.seats[0].coins = 7
    applyCoup(s, 'p0', 'p1')
    return s
  }

  it('auto-picks the leftmost face-down card', () => {
    const state = mid()
    applyInfluenceTimeout(state, 'p1')
    expect(state.seats[1].influence[0].status).toBe('revealed')
    expect(state.seats[1].influence[1].status).toBe('face-down')
  })

  it('picks the right card if the left is already revealed', () => {
    const state = mid()
    state.seats[1].influence[0] = { status: 'revealed', kind: 'Duke' }
    applyInfluenceTimeout(state, 'p1')
    expect(state.seats[1].influence[1].status).toBe('revealed')
    expect(state.seats[1].isAlive).toBe(false) // both revealed now
  })

  it('rejects when phase is not INFLUENCE_LOSS', () => {
    const state = makeState()
    try {
      applyInfluenceTimeout(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('wrong_phase')
    }
  })

  it('rejects when a non-target player tries to time out', () => {
    const state = mid()
    try {
      applyInfluenceTimeout(state, 'p0')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('not_your_pick')
    }
  })

  it('throws no_face_down_cards when the picker has no face-down cards', () => {
    const state = mid()
    state.seats[1].influence[0] = { status: 'revealed', kind: 'Duke' }
    state.seats[1].influence[1] = { status: 'revealed', kind: 'Assassin' }
    try {
      applyInfluenceTimeout(state, 'p1')
      throw new Error('expected throw')
    } catch (e) {
      expect((e as IllegalActionError).code).toBe('no_face_down_cards')
    }
  })
})

// --- Integration ------------------------------------------------------------

describe('Coup + influence-pick — full sequences', () => {
  it('completes a Coup→pick cycle and gives turn to the next player', () => {
    const state = makeState({ turnIndex: 0 })
    state.seats[0].coins = 7
    applyCoup(state, 'p0', 'p2')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    applyInfluencePick(state, 'p2', 0)
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(1) // next alive after p0
    expect(state.seats[0].coins).toBe(0)
    expect(state.seats[2].influence[0].status).toBe('revealed')
    expect(state.seats[2].isAlive).toBe(true)
  })

  it('drops a 3-player game to GAME_OVER through two eliminations', () => {
    const state = makeState()
    // First Coup: p0 eliminates p1 (pre-reveal one of p1's cards to make the
    // single pick eliminate them).
    state.seats[0].coins = 7
    state.seats[1].influence[1] = { status: 'revealed', kind: 'Assassin' }
    applyCoup(state, 'p0', 'p1')
    applyInfluencePick(state, 'p1', 0)
    expect(state.seats[1].isAlive).toBe(false)
    expect(state.seats[1].eliminationOrder).toBe(1) // first out
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(2) // turn skipped to p2

    // p2's turn — p2 Coups p0. Pre-reveal one of p0's cards.
    state.seats[2].coins = 7
    state.seats[0].influence[1] = { status: 'revealed', kind: 'Assassin' }
    applyCoup(state, 'p2', 'p0')
    applyInfluencePick(state, 'p0', 0)
    expect(state.seats[0].isAlive).toBe(false)
    expect(state.seats[0].eliminationOrder).toBe(2) // second out
    expect(state.seats[2].eliminationOrder).toBeNull() // survivor
    expect(state.phase).toBe('GAME_OVER')
  })
})
