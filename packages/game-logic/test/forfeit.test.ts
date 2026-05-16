import { describe, expect, it } from 'vitest'
import { forfeitPlayer } from '../src/forfeit'
import type { GameState, ServerInfluence, ServerSeat } from '../src/state'

function seat(
  playerId: string,
  opts: {
    isAlive?: boolean
    coins?: number
    influence?: ServerInfluence[]
    isDisconnected?: boolean
    eliminationOrder?: number | null
  } = {},
): ServerSeat {
  return {
    playerId,
    displayName: playerId,
    coins: opts.coins ?? 2,
    isAlive: opts.isAlive ?? true,
    isDisconnected: opts.isDisconnected ?? false,
    eliminationOrder: opts.eliminationOrder ?? null,
    influence: opts.influence ?? [
      { status: 'face-down', kind: 'Duke' },
      { status: 'face-down', kind: 'Captain' },
    ],
  }
}

function makeState(seats: ServerSeat[], overrides: Partial<GameState> = {}): GameState {
  return {
    matchId: 'm1',
    phase: 'AWAITING_ACTION',
    turnIndex: 0,
    seats,
    courtDeck: [],
    pendingAction: null,
    pendingBlock: null,
    timerEndsAt: null,
    influenceLossQueue: [],
    exchangePool: null,
    ...overrides,
  }
}

describe('forfeitPlayer', () => {
  it('reveals all face-down cards and marks seat dead', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')])
    forfeitPlayer(state, 'p1')
    const p1 = state.seats.find((s) => s.playerId === 'p1')!
    expect(p1.isAlive).toBe(false)
    expect(p1.isDisconnected).toBe(true)
    for (const inf of p1.influence) {
      expect(inf.status).toBe('revealed')
    }
  })

  it('stamps a monotonic eliminationOrder on each forfeited seat', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')])
    expect(state.seats.every((s) => s.eliminationOrder === null)).toBe(true)
    forfeitPlayer(state, 'p1')
    expect(state.seats.find((s) => s.playerId === 'p1')!.eliminationOrder).toBe(1)
    forfeitPlayer(state, 'p2')
    expect(state.seats.find((s) => s.playerId === 'p2')!.eliminationOrder).toBe(2)
  })

  it('preserves already-revealed card identity', () => {
    const state = makeState([
      seat('p0'),
      seat('p1', {
        influence: [
          { status: 'revealed', kind: 'Duke' },
          { status: 'face-down', kind: 'Captain' },
        ],
      }),
      seat('p2'),
    ])
    forfeitPlayer(state, 'p1')
    const p1 = state.seats.find((s) => s.playerId === 'p1')!
    expect(p1.influence[0]).toStrictEqual({ status: 'revealed', kind: 'Duke' })
    expect(p1.influence[1]).toStrictEqual({ status: 'revealed', kind: 'Captain' })
  })

  it('is a no-op on an already-eliminated seat', () => {
    const state = makeState([
      seat('p0'),
      seat('p1', {
        isAlive: false,
        influence: [
          { status: 'revealed', kind: 'Duke' },
          { status: 'revealed', kind: 'Captain' },
        ],
      }),
      seat('p2'),
    ])
    const before = JSON.parse(JSON.stringify(state))
    forfeitPlayer(state, 'p1')
    expect(state).toStrictEqual(before)
  })

  it('throws for an unknown player', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')])
    expect(() => forfeitPlayer(state, 'p999')).toThrow(/unknown_player|not seated/i)
  })

  it('removes the player from the influence-loss queue', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')], {
      phase: 'INFLUENCE_LOSS',
      influenceLossQueue: ['p1', 'p2', 'p1'],
    })
    forfeitPlayer(state, 'p1')
    expect(state.influenceLossQueue).toStrictEqual(['p2'])
    // p2 is next picker → stay in INFLUENCE_LOSS.
    expect(state.phase).toBe('INFLUENCE_LOSS')
  })

  it('clears exchangePool and returns cards to deck when actor forfeits', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')], {
      phase: 'EXCHANGE_SELECTION',
      exchangePool: {
        actorPlayerId: 'p1',
        cards: ['Duke', 'Captain', 'Assassin', 'Ambassador'],
      },
      courtDeck: ['Contessa'],
    })
    forfeitPlayer(state, 'p1')
    expect(state.exchangePool).toBeNull()
    expect(state.courtDeck).toHaveLength(5)
    // Deck multiset includes the returned 4 + the existing 1.
    const counts: Record<string, number> = {}
    for (const c of state.courtDeck) counts[c] = (counts[c] ?? 0) + 1
    expect(counts).toStrictEqual({
      Duke: 1,
      Captain: 1,
      Assassin: 1,
      Ambassador: 1,
      Contessa: 1,
    })
  })

  it('evaporates pendingAction when forfeitee is the actor', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')], {
      phase: 'CHALLENGE_WINDOW',
      pendingAction: { actorPlayerId: 'p1', action: { kind: 'Tax' } },
    })
    forfeitPlayer(state, 'p1')
    expect(state.pendingAction).toBeNull()
    expect(state.pendingBlock).toBeNull()
  })

  it('evaporates pendingBlock + parent action when forfeitee is the blocker', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')], {
      phase: 'BLOCK_CHALLENGE_WINDOW',
      pendingAction: { actorPlayerId: 'p0', action: { kind: 'ForeignAid' } },
      pendingBlock: { blockerPlayerId: 'p1', claimedCharacter: 'Duke' },
    })
    forfeitPlayer(state, 'p1')
    expect(state.pendingBlock).toBeNull()
    expect(state.pendingAction).toBeNull()
  })

  it('flips to GAME_OVER when forfeit eliminates the second-to-last player', () => {
    // 2 alive (p0, p1), 1 already dead (p2, eliminated 1st). Forfeiting p1
    // leaves only p0 and stamps p1 as the 2nd elimination.
    const state = makeState([
      seat('p0'),
      seat('p1'),
      seat('p2', {
        isAlive: false,
        eliminationOrder: 1,
        influence: [
          { status: 'revealed', kind: 'Duke' },
          { status: 'revealed', kind: 'Captain' },
        ],
      }),
    ])
    forfeitPlayer(state, 'p1')
    expect(state.phase).toBe('GAME_OVER')
    expect(state.seats.find((s) => s.playerId === 'p1')!.eliminationOrder).toBe(2)
  })

  it('advances to next living seat when forfeitee was the turn player', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')], { turnIndex: 1 })
    forfeitPlayer(state, 'p1')
    expect(state.phase).toBe('AWAITING_ACTION')
    expect(state.turnIndex).toBe(2)
  })

  it('stays in INFLUENCE_LOSS when other pickers remain after forfeit', () => {
    const state = makeState([seat('p0'), seat('p1'), seat('p2')], {
      phase: 'INFLUENCE_LOSS',
      influenceLossQueue: ['p1', 'p0'],
    })
    forfeitPlayer(state, 'p1')
    expect(state.phase).toBe('INFLUENCE_LOSS')
    expect(state.influenceLossQueue).toStrictEqual(['p0'])
  })
})
