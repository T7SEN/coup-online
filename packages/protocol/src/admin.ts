// Admin identity — the one (or few) accounts permitted to reach /admin and
// the corresponding admin-only Worker endpoints. Both apps import this so the
// page-level gate (in apps/web/(site)/admin/page.tsx) and the endpoint-level
// gate (in apps/game-server/src/index.ts) agree on who counts as admin.
//
// Compared case-insensitively because OAuth providers and email transports
// commonly normalise the local-part. There is currently no `isAdmin` column
// on `user` — once admin grows past one or two operators, lift this into a DB
// flag and gate by that instead.

export const ADMIN_EMAILS: readonly string[] = [
  'a.hitelare2@gmail.com',
] as const

// Constant-time string equality. The length comparison is a short-circuit
// (acceptable here — the length of the admin email isn't a secret), but the
// per-character loop runs over every byte of the shorter string and ORs the
// XOR of each pair into an accumulator, so no early-exit on the first
// mismatch. Defends against a hypothetical timing side-channel where an
// attacker iterates plausible admin emails and watches response timing.
// Practical impact today is near zero (email addresses are public-ish), but
// the upgrade is one short function and the right pattern for any future
// secret comparison.
function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.trim().toLowerCase()
  // We iterate the admin list and short-circuit on match — the early-exit
  // here only reveals "was anyone matched" (the function's return value
  // anyway), not which character of which email matched.
  return ADMIN_EMAILS.some((a) =>
    constantTimeStringEqual(a.toLowerCase(), lower),
  )
}
