import { describe, expect, it } from 'vitest'
import { PlayerView } from '@coup-online/protocol'
import { buildPlayerView, UnknownPlayerError } from '../src/player-view'
import type { GameState } from '../src/state'

// Hand-crafted state with deterministic values. The deck multiset is intentionally
// minimal — buildPlayerView doesn't validate composition, that's the deal layer's job.
function makeTestState(): GameState {
  return {
    matchId: 'match-1',
    phase: 'AWAITING_ACTION',
    turnIndex: 1, // Bob's turn
    seats: [
      {
        playerId: 'p0',
        displayName: 'Alice',
        coins: 2,
        isAlive: true,
        isDisconnected: false,
        influence: [
          { status: 'face-down', kind: 'Duke' },
          { status: 'face-down', kind: 'Assassin' },
        ],
      },
      {
        playerId: 'p1',
        displayName: 'Bob',
        coins: 5,
        isAlive: true,
        isDisconnected: false,
        influence: [
          { status: 'face-down', kind: 'Captain' },
          { status: 'face-down', kind: 'Ambassador' },
        ],
      },
      {
        playerId: 'p2',
        displayName: 'Charlie',
        coins: 0,
        isAlive: true,
        isDisconnected: true,
        influence: [
          { status: 'face-down', kind: 'Contessa' },
          { status: 'revealed', kind: 'Duke' }, // Charlie lost one
        ],
      },
    ],
    courtDeck: ['Assassin', 'Captain', 'Ambassador', 'Contessa', 'Duke'],
    pendingAction: null,
    pendingBlock: null,
    timerEndsAt: null,
    influenceLossQueue: [],
    exchangePool: null,
  }
}

describe('buildPlayerView — basic structure', () => {
  it('copies matchId and phase unchanged', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.matchId).toBe('match-1')
    expect(view.phase).toBe('AWAITING_ACTION')
  })

  it('sets myPlayerId to the viewer', () => {
    expect(buildPlayerView(makeTestState(), 'p0').myPlayerId).toBe('p0')
    expect(buildPlayerView(makeTestState(), 'p2').myPlayerId).toBe('p2')
  })

  it('resolves turnPlayerId from turnIndex', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.turnPlayerId).toBe('p1')
  })

  it('reduces courtDeck to a count, never the cards', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.courtDeck).toStrictEqual({ count: 5 })
    // Defensive: ensure no array leaked under the hood.
    expect(Array.isArray((view.courtDeck as unknown as { cards?: unknown }).cards)).toBe(false)
  })

  it('preserves seat order', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.seats.map((s) => s.playerId)).toStrictEqual(['p0', 'p1', 'p2'])
  })

  it('passes through coins and presence flags', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.seats[1].coins).toBe(5)
    expect(view.seats[2].coins).toBe(0)
    expect(view.seats[2].isDisconnected).toBe(true)
    expect(view.seats[0].isDisconnected).toBe(false)
  })

  it('passes through timerEndsAt (null and non-null)', () => {
    expect(buildPlayerView(makeTestState(), 'p0').timerEndsAt).toBeNull()
    const withTimer = { ...makeTestState(), timerEndsAt: 1_700_000_000_000 }
    expect(buildPlayerView(withTimer, 'p0').timerEndsAt).toBe(1_700_000_000_000)
  })
})

describe('buildPlayerView — isMe flag', () => {
  it('marks isMe=true only on the viewer seat', () => {
    const view = buildPlayerView(makeTestState(), 'p1')
    const me = view.seats.find((s) => s.isMe)
    expect(me?.playerId).toBe('p1')
    expect(view.seats.filter((s) => s.isMe)).toHaveLength(1)
  })

  it('marks isMe=false on all non-viewer seats', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.seats[0].isMe).toBe(true)
    expect(view.seats[1].isMe).toBe(false)
    expect(view.seats[2].isMe).toBe(false)
  })
})

describe('buildPlayerView — hidden-information invariant (SKILL.md § 3.1)', () => {
  it('shows the viewer their own face-down cards with `kind`', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.seats[0].influence).toStrictEqual([
      { status: 'face-down', kind: 'Duke' },
      { status: 'face-down', kind: 'Assassin' },
    ])
  })

  it("hides OTHER players' face-down cards as { status: 'hidden' } with no kind", () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    // Bob's hand from Alice's view: both face-down → opaque
    expect(view.seats[1].influence).toStrictEqual([{ status: 'hidden' }, { status: 'hidden' }])
    // No `kind` property whatsoever
    for (const inf of view.seats[1].influence) {
      expect('kind' in inf).toBe(false)
    }
  })

  it("shows revealed cards to everyone (no slicing of face-up cards)", () => {
    // Charlie has one revealed Duke. Alice's view of Charlie should show that Duke.
    const fromAlice = buildPlayerView(makeTestState(), 'p0')
    expect(fromAlice.seats[2].influence[1]).toStrictEqual({ status: 'revealed', kind: 'Duke' })
    // Charlie's own view of the same card — same answer.
    const fromCharlie = buildPlayerView(makeTestState(), 'p2')
    expect(fromCharlie.seats[2].influence[1]).toStrictEqual({ status: 'revealed', kind: 'Duke' })
  })

  it("hides the viewer's own face-down cards from OTHER viewers", () => {
    // Alice's Duke + Assassin must look opaque to Bob and Charlie.
    const fromBob = buildPlayerView(makeTestState(), 'p1')
    expect(fromBob.seats[0].influence).toStrictEqual([{ status: 'hidden' }, { status: 'hidden' }])
    const fromCharlie = buildPlayerView(makeTestState(), 'p2')
    expect(fromCharlie.seats[0].influence).toStrictEqual([
      { status: 'hidden' },
      { status: 'hidden' },
    ])
  })

  it('still shows the eliminated viewer their own revealed cards', () => {
    // Charlie is alive in the fixture but has a revealed card. Confirm own-seat
    // slicing exposes the revealed kind from their own perspective too.
    const fromCharlie = buildPlayerView(makeTestState(), 'p2')
    expect(fromCharlie.seats[2].influence).toStrictEqual([
      { status: 'face-down', kind: 'Contessa' },
      { status: 'revealed', kind: 'Duke' },
    ])
  })

  it('does not include any court deck card kinds anywhere in the view', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    const serialized = JSON.stringify(view)
    // The court deck in the fixture contains "Assassin", "Captain", etc. — but our
    // fixture also has those words on legitimate face-up / face-down own cards.
    // A useful structural check is that courtDeck has only `count`.
    expect(Object.keys(view.courtDeck)).toStrictEqual(['count'])
    expect(serialized.includes('"cards"')).toBe(false)
  })
})

describe('buildPlayerView — influenceLossPlayerId', () => {
  it('is null when influenceLossQueue is empty', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.influenceLossPlayerId).toBeNull()
  })

  it('exposes the head of the influence-loss queue', () => {
    const state: GameState = {
      ...makeTestState(),
      phase: 'INFLUENCE_LOSS',
      influenceLossQueue: ['p2', 'p1'],
    }
    expect(buildPlayerView(state, 'p0').influenceLossPlayerId).toBe('p2')
    expect(buildPlayerView(state, 'p2').influenceLossPlayerId).toBe('p2')
  })

  it('does not leak any card identities — only the playerId', () => {
    const state: GameState = {
      ...makeTestState(),
      phase: 'INFLUENCE_LOSS',
      influenceLossQueue: ['p1'],
    }
    const view = buildPlayerView(state, 'p0')
    expect(view.influenceLossPlayerId).toBe('p1')
    // Bob's face-down cards still hidden from Alice.
    expect(view.seats[1].influence).toStrictEqual([{ status: 'hidden' }, { status: 'hidden' }])
  })
})

describe('buildPlayerView — pending state passthrough', () => {
  it('passes pendingAction through unchanged when set', () => {
    const state: GameState = {
      ...makeTestState(),
      phase: 'CHALLENGE_WINDOW',
      pendingAction: {
        actorPlayerId: 'p1',
        action: { kind: 'Steal', targetPlayerId: 'p0' },
      },
    }
    const view = buildPlayerView(state, 'p0')
    expect(view.pendingAction).toStrictEqual({
      actorPlayerId: 'p1',
      action: { kind: 'Steal', targetPlayerId: 'p0' },
    })
  })

  it('passes pendingBlock through unchanged when set', () => {
    const state: GameState = {
      ...makeTestState(),
      phase: 'BLOCK_CHALLENGE_WINDOW',
      pendingBlock: {
        blockerPlayerId: 'p2',
        claimedCharacter: 'Captain',
      },
    }
    const view = buildPlayerView(state, 'p0')
    expect(view.pendingBlock).toStrictEqual({
      blockerPlayerId: 'p2',
      claimedCharacter: 'Captain',
    })
  })

  it('keeps pendingAction and pendingBlock null when state has none', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    expect(view.pendingAction).toBeNull()
    expect(view.pendingBlock).toBeNull()
  })
})

describe('buildPlayerView — error handling', () => {
  it('throws UnknownPlayerError for an unseated playerId', () => {
    expect(() => buildPlayerView(makeTestState(), 'ghost')).toThrow(UnknownPlayerError)
  })

  it("error message names the offending playerId", () => {
    try {
      buildPlayerView(makeTestState(), 'ghost')
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownPlayerError)
      expect((e as Error).message).toContain('ghost')
    }
  })
})

describe('buildPlayerView — Zod schema conformance', () => {
  it('produces a view that validates against the PlayerView schema', () => {
    const view = buildPlayerView(makeTestState(), 'p0')
    const result = PlayerView.safeParse(view)
    expect(result.success).toBe(true)
  })

  it('produces a valid view from each seated viewer perspective', () => {
    const state = makeTestState()
    for (const seat of state.seats) {
      const view = buildPlayerView(state, seat.playerId)
      const result = PlayerView.safeParse(view)
      expect(result.success).toBe(true)
    }
  })
})
