import { describe, expect, it } from 'vitest'
import {
  INITIAL_MU,
  INITIAL_SIGMA,
  rateMatch,
  type SeatResult,
} from '../src'

function freshSeats(n: number): SeatResult[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `p${i}`,
    mu: INITIAL_MU,
    sigma: INITIAL_SIGMA,
    finishingPosition: i + 1,
  }))
}

describe('rateMatch — 3-player free-for-all (fresh accounts)', () => {
  const results = rateMatch(freshSeats(3))

  it('returns one delta per seat', () => {
    expect(results).toHaveLength(3)
  })

  it('preserves input order', () => {
    expect(results.map((r) => r.playerId)).toStrictEqual(['p0', 'p1', 'p2'])
  })

  it('carries before-values from input', () => {
    for (const r of results) {
      expect(r.muBefore).toBe(INITIAL_MU)
      expect(r.sigmaBefore).toBe(INITIAL_SIGMA)
    }
  })

  it("winner's mu increases", () => {
    const winner = results[0]
    expect(winner.muAfter).toBeGreaterThan(winner.muBefore)
  })

  it("last-place mu decreases", () => {
    const last = results[2]
    expect(last.muAfter).toBeLessThan(last.muBefore)
  })

  it('every player sigma decreases (uncertainty resolves)', () => {
    for (const r of results) {
      expect(r.sigmaAfter).toBeLessThan(r.sigmaBefore)
    }
  })

  it('middle finisher mu is between winner and last (mostly — TrueSkill is not strictly monotonic but should be for symmetric inputs)', () => {
    const [w, mid, last] = results
    expect(mid.muAfter).toBeLessThan(w.muAfter)
    expect(mid.muAfter).toBeGreaterThan(last.muAfter)
  })
})

describe('rateMatch — 6-player free-for-all', () => {
  const results = rateMatch(freshSeats(6))

  it('returns one delta per seat', () => {
    expect(results).toHaveLength(6)
  })

  it("winner's mu rises and 6th place mu drops", () => {
    expect(results[0].muAfter).toBeGreaterThan(INITIAL_MU)
    expect(results[5].muAfter).toBeLessThan(INITIAL_MU)
  })

  it('finishing-position ordering is reflected in muAfter', () => {
    for (let i = 0; i < results.length - 1; i++) {
      // Each higher-finishing player should end with at least as much mu as
      // the next-lower finisher. (Strict > for symmetric fresh inputs.)
      expect(results[i].muAfter).toBeGreaterThan(results[i + 1].muAfter)
    }
  })
})

describe('rateMatch — uneven pre-match ratings', () => {
  it('a low-rated winner gains more mu than a high-rated winner would', () => {
    // Upset: a sigma=2 underdog with mu=20 beats two stronger players.
    const upset = rateMatch([
      { playerId: 'underdog', mu: 20, sigma: 2, finishingPosition: 1 },
      { playerId: 'fav1', mu: 32, sigma: 2, finishingPosition: 2 },
      { playerId: 'fav2', mu: 30, sigma: 2, finishingPosition: 3 },
    ])
    // Baseline: same finisher but already a known strong player.
    const baseline = rateMatch([
      { playerId: 'strong', mu: 32, sigma: 2, finishingPosition: 1 },
      { playerId: 'fav1', mu: 32, sigma: 2, finishingPosition: 2 },
      { playerId: 'fav2', mu: 30, sigma: 2, finishingPosition: 3 },
    ])
    const upsetGain = upset[0].muAfter - upset[0].muBefore
    const baselineGain = baseline[0].muAfter - baseline[0].muBefore
    expect(upsetGain).toBeGreaterThan(baselineGain)
  })
})

describe('rateMatch — input validation', () => {
  it('rejects fewer than 2 seats', () => {
    expect(() => rateMatch([])).toThrow()
    expect(() =>
      rateMatch([{ playerId: 'a', mu: 25, sigma: 8.33, finishingPosition: 1 }]),
    ).toThrow()
  })

  it('rejects non-finite mu', () => {
    expect(() =>
      rateMatch([
        { playerId: 'a', mu: Number.NaN, sigma: 8.33, finishingPosition: 1 },
        { playerId: 'b', mu: 25, sigma: 8.33, finishingPosition: 2 },
      ]),
    ).toThrow()
  })

  it('rejects non-positive sigma', () => {
    expect(() =>
      rateMatch([
        { playerId: 'a', mu: 25, sigma: 0, finishingPosition: 1 },
        { playerId: 'b', mu: 25, sigma: 8.33, finishingPosition: 2 },
      ]),
    ).toThrow()
    expect(() =>
      rateMatch([
        { playerId: 'a', mu: 25, sigma: -1, finishingPosition: 1 },
        { playerId: 'b', mu: 25, sigma: 8.33, finishingPosition: 2 },
      ]),
    ).toThrow()
  })

  it('rejects non-integer or zero finishingPosition', () => {
    expect(() =>
      rateMatch([
        { playerId: 'a', mu: 25, sigma: 8.33, finishingPosition: 0 },
        { playerId: 'b', mu: 25, sigma: 8.33, finishingPosition: 2 },
      ]),
    ).toThrow()
    expect(() =>
      rateMatch([
        { playerId: 'a', mu: 25, sigma: 8.33, finishingPosition: 1.5 },
        { playerId: 'b', mu: 25, sigma: 8.33, finishingPosition: 2 },
      ]),
    ).toThrow()
  })
})

describe('rateMatch — does not mutate input', () => {
  it('input seat objects are unchanged after rate', () => {
    const seats: SeatResult[] = freshSeats(3)
    const snapshot = seats.map((s) => ({ ...s }))
    rateMatch(seats)
    expect(seats).toStrictEqual(snapshot)
  })
})
