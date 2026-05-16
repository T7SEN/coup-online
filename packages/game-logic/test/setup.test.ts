import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import { DECK } from '../src/deck'
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_COINS, dealInitialState } from '../src/setup'

function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`,
    displayName: `Player ${i}`,
  }))
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

describe('dealInitialState', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    describe(`with ${n} players`, () => {
      const state = dealInitialState('m1', makePlayers(n))

      it('deals 2 face-down cards per player', () => {
        for (const seat of state.seats) {
          expect(seat.influence).toHaveLength(2)
          for (const inf of seat.influence) {
            expect(inf.status).toBe('face-down')
          }
        }
      })

      it(`leaves ${15 - 2 * n} cards in the court deck`, () => {
        expect(state.courtDeck).toHaveLength(15 - 2 * n)
      })

      it('gives each player 2 starting coins', () => {
        for (const seat of state.seats) {
          expect(seat.coins).toBe(STARTING_COINS)
        }
      })

      it('marks every player alive, connected, and not yet eliminated', () => {
        for (const seat of state.seats) {
          expect(seat.isAlive).toBe(true)
          expect(seat.isDisconnected).toBe(false)
          expect(seat.eliminationOrder).toBeNull()
        }
      })

      it('preserves the full 15-card multiset across dealt + court deck', () => {
        const allCards: CardKind[] = [
          ...state.seats.flatMap((s) => s.influence.map((i) => i.kind)),
          ...state.courtDeck,
        ]
        expect(allCards).toHaveLength(15)
        expect(countByKind(allCards)).toStrictEqual(countByKind(DECK))
      })

      it('picks a turnIndex within the seat range', () => {
        expect(state.turnIndex).toBeGreaterThanOrEqual(0)
        expect(state.turnIndex).toBeLessThan(n)
      })

      it('starts in AWAITING_ACTION with no pending action or block', () => {
        expect(state.phase).toBe('AWAITING_ACTION')
        expect(state.pendingAction).toBeNull()
        expect(state.pendingBlock).toBeNull()
        expect(state.timerEndsAt).toBeNull()
      })

      it('preserves caller-provided seat order', () => {
        const expected = makePlayers(n).map((p) => p.playerId)
        const actual = state.seats.map((s) => s.playerId)
        expect(actual).toStrictEqual(expected)
      })
    })
  }

  // MIN_PLAYERS-relative so it survives the TEMP(2-player testing) change.
  it('rejects fewer than MIN_PLAYERS', () => {
    expect(() => dealInitialState('m1', makePlayers(MIN_PLAYERS - 1))).toThrow()
    expect(() => dealInitialState('m1', [])).toThrow()
  })

  it('rejects more than 6 players', () => {
    expect(() => dealInitialState('m1', makePlayers(7))).toThrow()
    expect(() => dealInitialState('m1', makePlayers(10))).toThrow()
  })
})
