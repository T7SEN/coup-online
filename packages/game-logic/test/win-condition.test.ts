import { describe, expect, it } from 'vitest'
import { checkWinner, computeFinishingPositions } from '../src/win-condition'
import type { GameState, ServerSeat } from '../src/state'

function seat(
  playerId: string,
  isAlive: boolean,
  eliminationOrder: number | null = null,
): ServerSeat {
  return {
    playerId,
    displayName: playerId,
    coins: 0,
    isAlive,
    isDisconnected: false,
    eliminationOrder,
    influence: [
      { status: isAlive ? 'face-down' : 'revealed', kind: 'Duke' },
      { status: isAlive ? 'face-down' : 'revealed', kind: 'Assassin' },
    ],
  }
}

function makeState(seats: ServerSeat[]): GameState {
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
  }
}

describe('checkWinner', () => {
  it('returns null with 3 alive players', () => {
    const state = makeState([seat('p0', true), seat('p1', true), seat('p2', true)])
    expect(checkWinner(state)).toBeNull()
  })

  it('returns null with 2 alive players', () => {
    const state = makeState([seat('p0', true), seat('p1', true), seat('p2', false)])
    expect(checkWinner(state)).toBeNull()
  })

  it('returns the lone survivor with 1 alive player', () => {
    const state = makeState([seat('p0', false), seat('p1', true), seat('p2', false)])
    expect(checkWinner(state)).toBe('p1')
  })

  it('returns the lone survivor regardless of seat position', () => {
    expect(
      checkWinner(makeState([seat('p0', true), seat('p1', false), seat('p2', false)])),
    ).toBe('p0')
    expect(
      checkWinner(makeState([seat('p0', false), seat('p1', false), seat('p2', true)])),
    ).toBe('p2')
  })

  it('returns null defensively when 0 alive (should not occur in practice)', () => {
    const state = makeState([seat('p0', false), seat('p1', false), seat('p2', false)])
    expect(checkWinner(state)).toBeNull()
  })

  it('does not mutate state', () => {
    const state = makeState([seat('p0', true), seat('p1', false)])
    const aliveBefore = state.seats.map((s) => s.isAlive)
    checkWinner(state)
    expect(state.seats.map((s) => s.isAlive)).toStrictEqual(aliveBefore)
  })
})

describe('computeFinishingPositions', () => {
  it('ranks the survivor 1st and the eliminated by reverse elimination order', () => {
    // p2 was knocked out first, p1 second; p0 survives.
    const state = makeState([
      seat('p0', true),
      seat('p1', false, 2),
      seat('p2', false, 1),
    ])
    const positions = computeFinishingPositions(state)
    expect(positions.get('p0')).toBe(1) // survivor → winner
    expect(positions.get('p1')).toBe(2) // last eliminated → runner-up
    expect(positions.get('p2')).toBe(3) // first eliminated → last place
  })

  it('produces distinct positions 1..N for a finished N-player match', () => {
    const state = makeState([
      seat('p0', false, 1),
      seat('p1', true),
      seat('p2', false, 3),
      seat('p3', false, 2),
    ])
    const positions = computeFinishingPositions(state)
    expect(positions.get('p1')).toBe(1) // survivor
    expect(positions.get('p2')).toBe(2) // eliminated last
    expect(positions.get('p3')).toBe(3)
    expect(positions.get('p0')).toBe(4) // eliminated first
    expect([...positions.values()].sort((a, b) => a - b)).toStrictEqual([1, 2, 3, 4])
  })

  it('covers every seat exactly once', () => {
    const state = makeState([seat('p0', true), seat('p1', false, 1)])
    expect(computeFinishingPositions(state).size).toBe(2)
  })

  it('ties survivors at 1st mid-game; the eliminated rank below all of them', () => {
    // Mid-game (not a meaningful final result): 2 still alive, p2 already out.
    // Survivors tie at 1; the eliminated seat ranks below both → 3rd of 3
    // (standard competition ranking — tied slots are consumed).
    const state = makeState([
      seat('p0', true),
      seat('p1', true),
      seat('p2', false, 1),
    ])
    const positions = computeFinishingPositions(state)
    expect(positions.get('p0')).toBe(1)
    expect(positions.get('p1')).toBe(1)
    expect(positions.get('p2')).toBe(3)
  })
})
