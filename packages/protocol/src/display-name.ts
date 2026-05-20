// Nickname / display-name validation. Shared by the Worker (authoritative —
// apps/game-server PATCH /api/me/profile) and the web profile editor (instant
// client-side feedback). Both import this single source so the rules can't
// drift apart.
//
// Rules: 3–20 characters; English letters, digits, and single internal
// spaces only (no leading/trailing spaces — callers trim first); not a known
// profanity. The profanity list is a deterrent, not a guarantee.

export const DISPLAY_NAME_MIN = 3
export const DISPLAY_NAME_MAX = 20

// ASCII letter/digit runs separated by single spaces. Rejects punctuation,
// emoji, and non-Latin scripts — the leaderboard and in-game seats render
// Latin only.
const ALLOWED = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/

// Curated profanity list, in the normalized form produced by
// `normalizeForProfanity` (lowercase a–z only). Deliberately excludes short
// words that are common innocent substrings (e.g. "ass" → "class") to keep
// false positives down. Not exhaustive.
const BAD_WORDS = [
  'fuck',
  'motherfucker',
  'shit',
  'bullshit',
  'dipshit',
  'bitch',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'pussy',
  'asshole',
  'dickhead',
  'cocksucker',
  'wanker',
  'twat',
  'bastard',
  'jizz',
  'kike',
  'chink',
  'tranny',
  'wetback',
  'nazi',
  'rapist',
  'pedophile',
  'molest',
]

export type DisplayNameError =
  | 'too_short'
  | 'too_long'
  | 'invalid_chars'
  | 'profanity'

export interface DisplayNameResult {
  ok: boolean
  error?: DisplayNameError
}

// Collapse a name to lowercase a–z, mapping common leet substitutions, so
// "f u c k", "f.u.c.k" and "fvck"-style evasions still match.
function normalizeForProfanity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[4@]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '')
}

// Validate a raw (untrimmed) nickname. Callers may trim first; this trims
// again defensively so the result is consistent either way.
export function validateDisplayName(raw: string): DisplayNameResult {
  const name = raw.trim()
  if (name.length < DISPLAY_NAME_MIN) return { ok: false, error: 'too_short' }
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, error: 'too_long' }
  if (!ALLOWED.test(name)) return { ok: false, error: 'invalid_chars' }
  const normalized = normalizeForProfanity(name)
  if (BAD_WORDS.some((w) => normalized.includes(w))) {
    return { ok: false, error: 'profanity' }
  }
  return { ok: true }
}

// Human-readable message for a validation failure — shown in the profile
// editor.
export function displayNameErrorMessage(error: DisplayNameError): string {
  switch (error) {
    case 'too_short':
      return `Your nickname must be at least ${DISPLAY_NAME_MIN} characters.`
    case 'too_long':
      return `Your nickname can be at most ${DISPLAY_NAME_MAX} characters.`
    case 'invalid_chars':
      return 'Use only English letters, numbers, and spaces.'
    case 'profanity':
      return 'Please choose a different nickname.'
  }
}
