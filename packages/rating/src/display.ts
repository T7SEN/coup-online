// SKILL.md § 3.6 — leaderboard display formula: mu − 3·sigma, rounded to the
// nearest integer.
//
// This is the conservative skill estimate (Microsoft's recommended display
// formula). Never display mu alone: a brand-new account starts at mu=25,
// sigma=25/3, so its conservative rating is 0 — exactly where it belongs on
// the leaderboard until games narrow sigma.
//
// After ~10–20 ranked games, sigma converges and the conservative number
// stabilizes near the player's true skill.
export function conservativeRating(mu: number, sigma: number): number {
  return Math.round(mu - 3 * sigma)
}
