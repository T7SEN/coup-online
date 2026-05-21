// Patron cosmetic enums shared between the Worker, the DO, and the web client.
// Kept in protocol so the validation in /api/me/patron (Worker), the Settings
// UI (web), and the in-room renderers (web) can't drift out of sync — a new
// skin or theme is added here and the type system flags every site that
// switches on it.
//
// `null` is the implicit fifth value for every choice: "no override, use
// the default". The DB columns are nullable; the wire shapes pass null
// through; the renderers fall back to the default visual when null.

export const CARD_BACK_SKINS = [
  'parchment',
  'oxblood',
  'forest',
  'ivory',
] as const
export type CardBackSkin = (typeof CARD_BACK_SKINS)[number]

export const TABLE_THEMES = [
  'standard',
  'oxblood-court',
  'forest',
  'midnight',
] as const
export type TableTheme = (typeof TABLE_THEMES)[number]

// Type guards — narrow `string | null` (the wire shape) to a known enum
// member, returning null on miss. Use at every boundary where untrusted data
// could land in the cosmetic slots.
export function asCardBackSkin(v: string | null | undefined): CardBackSkin | null {
  if (v == null) return null
  return (CARD_BACK_SKINS as readonly string[]).includes(v)
    ? (v as CardBackSkin)
    : null
}

export function asTableTheme(v: string | null | undefined): TableTheme | null {
  if (v == null) return null
  return (TABLE_THEMES as readonly string[]).includes(v)
    ? (v as TableTheme)
    : null
}
