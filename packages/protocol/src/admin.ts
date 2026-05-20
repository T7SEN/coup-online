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

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.trim().toLowerCase()
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === lower)
}
