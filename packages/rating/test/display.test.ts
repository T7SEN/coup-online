import { describe, expect, it } from 'vitest'
import { conservativeRating, INITIAL_MU, INITIAL_SIGMA } from '../src'

describe('conservativeRating', () => {
  it('returns mu - 3*sigma rounded to nearest integer', () => {
    expect(conservativeRating(40, 3)).toBe(31) // 40 - 9 = 31
    expect(conservativeRating(30, 2)).toBe(24) // 30 - 6 = 24
  })

  it('rounds halves toward positive infinity (JS Math.round convention)', () => {
    expect(conservativeRating(45, 1.5)).toBe(41) // 45 - 4.5 = 40.5 → 41
  })

  it('returns ~0 for a fresh account (INITIAL_MU - 3*INITIAL_SIGMA = 25 - 25)', () => {
    // Floating-point: 3 * (25/3) is 25.000…04, so the raw value is a tiny
    // negative number; Math.round normalizes to 0.
    expect(conservativeRating(INITIAL_MU, INITIAL_SIGMA)).toBe(0)
  })

  it('handles mature accounts (sigma converged)', () => {
    // High-skill mature player
    expect(conservativeRating(45, 1.5)).toBe(41)
    // Mid-skill mature player
    expect(conservativeRating(30, 2)).toBe(24)
  })

  it('returns negative numbers for very weak players (mu < 3*sigma)', () => {
    expect(conservativeRating(10, 5)).toBe(-5) // 10 - 15
    expect(conservativeRating(5, 8)).toBe(-19) // 5 - 24
  })

  it('returns an integer', () => {
    expect(Number.isInteger(conservativeRating(25, 8.333333))).toBe(true)
    expect(Number.isInteger(conservativeRating(33.7, 2.123))).toBe(true)
  })
})
