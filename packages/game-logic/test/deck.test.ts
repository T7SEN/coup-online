import { describe, expect, it } from 'vitest'
import type { CardKind } from '@coup-online/protocol'
import { DECK, DECK_SIZE, drawFromDeck, returnToDeckAndShuffle, shuffle } from '../src/deck'

// SKILL.md § 4.1 — deck composition is immutable. These tests guard the invariant
// in case anyone is tempted to add expansion characters or change the multiplicities.

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

describe('DECK composition', () => {
  it('has exactly 15 cards', () => {
    expect(DECK).toHaveLength(15)
    expect(DECK_SIZE).toBe(15)
  })

  it('has exactly 3 of each base-game character', () => {
    expect(countByKind(DECK)).toStrictEqual({
      Duke: 3,
      Assassin: 3,
      Captain: 3,
      Ambassador: 3,
      Contessa: 3,
    })
  })

  it('is frozen (cannot be mutated)', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(DECK as any).push('Duke')
    }).toThrow()
  })
})

describe('shuffle', () => {
  it('returns a new array of the same length', () => {
    const shuffled = shuffle(DECK)
    expect(shuffled).toHaveLength(DECK.length)
    expect(shuffled).not.toBe(DECK) // identity check — different reference
  })

  it('preserves the deck multiset', () => {
    const shuffled = shuffle(DECK)
    expect(countByKind(shuffled)).toStrictEqual(countByKind(DECK))
  })

  it('does not mutate the input', () => {
    const before = [...DECK]
    shuffle(DECK)
    expect([...DECK]).toStrictEqual(before)
  })

  it('produces at least some different orderings across many runs', () => {
    // Light sanity check, not a real RNG quality test. 50 shuffles should produce
    // multiple distinct orderings unless the RNG is catastrophically broken.
    const orderings = new Set<string>()
    for (let i = 0; i < 50; i++) {
      orderings.add(shuffle(DECK).join(','))
    }
    expect(orderings.size).toBeGreaterThan(1)
  })
})

describe('drawFromDeck', () => {
  it('removes and returns the requested number of cards', () => {
    const deck = shuffle(DECK)
    const sizeBefore = deck.length
    const drawn = drawFromDeck(deck, 2)
    expect(drawn).toHaveLength(2)
    expect(deck).toHaveLength(sizeBefore - 2)
  })

  it('draws from the top (end of array)', () => {
    const deck: CardKind[] = ['Duke', 'Assassin', 'Captain']
    const drawn = drawFromDeck(deck, 2)
    expect(drawn).toStrictEqual(['Captain', 'Assassin'])
    expect(deck).toStrictEqual(['Duke'])
  })

  it('rejects negative or non-integer n', () => {
    const deck = shuffle(DECK)
    expect(() => drawFromDeck(deck, -1)).toThrow()
    expect(() => drawFromDeck(deck, 1.5)).toThrow()
  })

  it('rejects drawing more than the deck holds', () => {
    const deck: CardKind[] = ['Duke']
    expect(() => drawFromDeck(deck, 2)).toThrow()
  })
})

describe('returnToDeckAndShuffle', () => {
  it('appends the cards and re-shuffles', () => {
    const deck: CardKind[] = ['Duke', 'Assassin']
    returnToDeckAndShuffle(deck, ['Captain', 'Ambassador'])
    expect(deck).toHaveLength(4)
    expect(countByKind(deck)).toStrictEqual({
      Duke: 1,
      Assassin: 1,
      Captain: 1,
      Ambassador: 1,
      Contessa: 0,
    })
  })

  it('preserves the full multiset after return', () => {
    const deck = shuffle(DECK)
    const drawnAside = drawFromDeck(deck, 4)
    expect(deck).toHaveLength(11)
    returnToDeckAndShuffle(deck, drawnAside)
    expect(deck).toHaveLength(15)
    expect(countByKind(deck)).toStrictEqual(countByKind(DECK))
  })
})
