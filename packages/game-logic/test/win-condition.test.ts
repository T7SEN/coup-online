import { describe, expect, it } from 'vitest'
import { checkWinner } from '../src/win-condition'
import type { GameState, ServerSeat } from '../src/state'

function seat(playerId: string, isAlive: boolean): ServerSeat {
  return {
    playerId,
    displayName: playerId,
    coins: 0,
    isAlive,
    isDisconnected: false,
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
