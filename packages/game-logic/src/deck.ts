import type { CardKind } from '@coup-online/protocol'

// SKILL.md § 4.1 — deck composition is IMMUTABLE: exactly 15 cards, 3 each of the
// five base-game characters. Server validates against this constant after every
// shuffle / exchange / challenge-resolution to catch invariant violations.
export const DECK: readonly CardKind[] = Object.freeze([
  'Duke',
  'Duke',
  'Duke',
  'Assassin',
  'Assassin',
  'Assassin',
  'Captain',
  'Captain',
  'Captain',
  'Ambassador',
  'Ambassador',
  'Ambassador',
  'Contessa',
  'Contessa',
  'Contessa',
])

export const DECK_SIZE = DECK.length // 15

// Web Crypto handle. Available globally in Cloudflare Workers (no node:crypto allowed,
// SKILL.md § 5) and in Node 20+ (the Vitest test runner). globalThis cast is the
// strict-mode pattern called out in SKILL.md § 5 for browser-global access.
const webCrypto = (
  globalThis as unknown as {
    crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T }
  }
).crypto

// Uniform random integer in [0, maxExclusive) using crypto.getRandomValues().
// Rejection sampling on the smallest power-of-2 mask that covers `maxExclusive`,
// so there is no modulo bias. Re-used by setup (random turnIndex) and later by
// room-code generation (where bias would matter more for entropy than for a
// 15-card shuffle). SKILL.md § 5 — never Math.random for anything game-affecting.
export function randomIntBelow(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(
      `randomIntBelow: maxExclusive must be a positive integer (got ${maxExclusive})`,
    )
  }
  if (maxExclusive === 1) return 0
  // Smallest k such that 2^k >= maxExclusive.
  const bits = 32 - Math.clz32(maxExclusive - 1)
  // Mask covers exactly that many bits.
  const mask = (1 << bits) - 1
  const buf = new Uint32Array(1)
  // Reject any draw that lands outside [0, maxExclusive). Expected iterations < 2.
  for (;;) {
    webCrypto.getRandomValues(buf)
    const r = buf[0] & mask
    if (r < maxExclusive) return r
  }
}

// Fisher-Yates shuffle (in-place on a fresh copy). Returns a new array; never
// mutates `items`. SKILL.md § 4.2 — server-side shuffle on game start.
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIntBelow(i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// Draw `n` cards from the TOP of the deck (the end of the array, treated as
// the draw position). Mutates `deck` in place. Returns the drawn cards in
// draw order. Throws if the deck is too small.
export function drawFromDeck(deck: CardKind[], n: number): CardKind[] {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`drawFromDeck: n must be a non-negative integer (got ${n})`)
  }
  if (n > deck.length) {
    throw new Error(`drawFromDeck: requested ${n} cards but deck has only ${deck.length}`)
  }
  const drawn: CardKind[] = []
  for (let i = 0; i < n; i++) {
    // `.pop()` is safe because the bounds check above guarantees length > 0.
    drawn.push(deck.pop() as CardKind)
  }
  return drawn
}

// Return `cards` to the deck and re-shuffle. SKILL.md § 4.6 / § 3.2 phase 7 —
// after a proven challenge or an Ambassador exchange, returned cards re-enter
// the deck and the deck is reshuffled so future draws can't be inferred.
export function returnToDeckAndShuffle(deck: CardKind[], cards: readonly CardKind[]): void {
  for (const c of cards) deck.push(c)
  // In-place re-shuffle using a fresh shuffled copy.
  const reshuffled = shuffle(deck)
  deck.length = 0
  for (const c of reshuffled) deck.push(c)
}
