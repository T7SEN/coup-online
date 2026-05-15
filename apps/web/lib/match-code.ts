// SKILL.md § 3.3 spec for room codes: 6 chars from a 32-symbol alphabet that
// excludes ambiguous glyphs (I, O, 0, 1). 32^6 ≈ 1.07 B combinations — birthday
// collision probability under realistic concurrent-match counts is negligible
// for v1. Future: RoomCodeRegistry DO with TTL + collision check (durable-objects.md).
//
// Web Crypto only — SKILL.md § 5 forbids Math.random for anything game-affecting.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

// Generate a fresh 6-char code. Uses crypto.getRandomValues with a 5-bit mask;
// 2^32 is divisible by 32 so masking 5 bits off any 32-bit (or 8-bit) word
// gives a uniform distribution over [0, 31] with no rejection sampling needed.
export function generateMatchCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  window.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] & 0x1f]
  }
  return out
}

// Normalize any "paste this to join" input into a bare match code.
//
// Accepts:
//   - bare code:      "ABCDEF"     → "ABCDEF"
//   - full URL:       "https://host/room/ABCDEF"      → "ABCDEF"
//   - URL with hash:  "https://host/room/ABCDEF?x=1"  → "ABCDEF"
//   - bare path:      "/room/ABCDEF"                  → "ABCDEF"
//   - lowercase:      "abcdef"     → "ABCDEF"  (idFromName is case-sensitive;
//                                              upper-casing prevents same-code
//                                              collisions with case variance)
//   - whitespace:     "  ABCDEF  " → "ABCDEF"
//
// Does NOT validate that the result matches the 6-char base32 format — a user
// pasting a legacy UUID code should still work. Callers send to the server,
// which routes via idFromName.
export function parseMatchCode(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0) return ''
  const pathMatch = trimmed.match(/\/room\/([^/?#\s]+)/)
  const raw = pathMatch ? decodeURIComponent(pathMatch[1]) : trimmed
  return raw.toUpperCase()
}
