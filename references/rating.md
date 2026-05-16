# Rating — TrueSkill wrapper

Companion to SKILL.md § 3.6. Lives in `packages/rating/`. Provides the math the
DO calls at `endGame()` to update each player's rating, plus the leaderboard
display formula.

---

## Why TrueSkill (not Elo / Glicko-2)

Coup is **3-6 player free-for-all**. TrueSkill is the only mainstream rating
system that natively models N-player free-for-all in one update:

- **Elo** is 1v1 only. Adapting to N-player means N(N−1)/2 pairwise updates per
  match, which double-counts pairwise interactions and produces drift.
- **Glicko-2** has the same pairwise-decomposition problem.
- **TrueSkill** models the full ranking in a single Bayesian inference pass,
  using rank order as the observed signal.

See also: [`anti-hallucination.md`](./anti-hallucination.md) — Rating section.

## Project constants (`packages/rating/src/constants.ts`)

| Constant | Value | What it means |
|---|---|---|
| `INITIAL_MU` | 25 | Starting skill estimate for a fresh account |
| `INITIAL_SIGMA` | 25/3 ≈ 8.33 | Starting uncertainty |
| `BETA` | 25/6 ≈ 4.17 | Distance giving ~76% chance of winning |
| `TAU` | 25/300 ≈ 0.083 | Dynamic factor — small additive noise on sigma between matches so the system stays adaptive even for established players |
| `DRAW_PROBABILITY` | 0 | Coup has no draws (last face-down card wins outright) |

These mirror the Microsoft TrueSkill defaults exactly. Don't tune unless you
have a real reason; tuning these is a spec amendment.

## API

### `rateMatch(seats: readonly SeatResult[]): RatingDelta[]`

Rate a finished match.

**Input — `SeatResult` (one per seat at game end):**

```ts
interface SeatResult {
  readonly playerId: string
  readonly mu: number               // pre-match
  readonly sigma: number            // pre-match
  readonly finishingPosition: number // 1 = winner, 2 = runner-up, ...
}
```

**Output — `RatingDelta` (one per input seat, in the same order):**

```ts
interface RatingDelta {
  readonly playerId: string
  readonly muBefore: number
  readonly sigmaBefore: number
  readonly muAfter: number
  readonly sigmaAfter: number
}
```

**Validation (throws plain `Error` on misuse):**
- Fewer than 2 seats
- `mu` or `sigma` non-finite
- `sigma <= 0`
- `finishingPosition` not a positive integer

**Mutation contract:** does **not** mutate inputs. Returns fresh `RatingDelta`
objects. Each `RatingDelta` is structurally `readonly`.

### `conservativeRating(mu: number, sigma: number): number`

Leaderboard display value: `Math.round(mu − 3·sigma)`.

Why `mu − 3·sigma` rather than just `mu`: a brand-new account starts at
`mu=25, sigma=25/3`, so `mu − 3·sigma = 0`. Displaying mu alone would put
fresh accounts at "25" — the same number as a fully-converged average player.
The conservative subtraction makes new accounts visibly distinct from mature
ones, and the ranking on the leaderboard reflects "skill we're confident in"
rather than "skill we've barely measured."

After ~10–20 ranked games, sigma converges to ~2-3 and the conservative
number stabilizes near the player's true skill.

## Usage pattern

```ts
import { rateMatch } from '@coup-online/rating'
import { computeFinishingPositions } from '@coup-online/game-logic'

// apps/game-server/src/db-helpers.ts — persistMatchResult() runs as the LAST
// step of the GameRoom DO's game-end handling (SKILL.md § 5).
//
// 1. computeFinishingPositions(finalState) → Map<playerId, position>. Position
//    is derived from each seat's `eliminationOrder` (reverse elimination order
//    — see the next section); the lone survivor is 1st.
// 2. Snapshot pre-match mu/sigma from the players' `user` rows in D1.
// 3. rateMatch(seatResults) → RatingDelta[]. Each SeatResult carries mu, sigma,
//    and the finishing position from step 1.
// 4. One db.batch(): the match row + N match_player rows + N mmr_history rows
//    + N user mu/sigma updates — atomic.
```

For the leaderboard query:

```ts
// SELECT user_id, mu, sigma FROM users — then compute display value in app:
const top100 = users
  .map((u) => ({ ...u, rating: conservativeRating(u.mu, u.sigma) }))
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 100)
```

## Why finishingPosition (1-indexed) instead of ranks (0-indexed)

`ts-trueskill`'s `rate()` function takes a 0-indexed `ranks` parameter where
lower = better. The wrapper converts internally (`finishingPosition - 1`).

Reason: 1-indexed "finishingPosition" matches user expectations (1st, 2nd,
3rd) and matches the `finishing_position` column in the planned `match_players`
D1 table. Callers and persistence layers don't have to think about TrueSkill's
internal convention.

## How finishing position is determined

`finishingPosition` is **not** stored as a field — it's derived at game end from
elimination order, which lives in game-logic.

Each `ServerSeat` carries `eliminationOrder: number | null`: `null` while the
seat is alive, and a 1-based ordinal stamped exactly once at the moment the seat
is eliminated (1 = first player knocked out). Both elimination paths set it via
`nextEliminationOrder(state)` — `applyInfluencePick` (lost the last influence)
and `forfeitPlayer` (disconnect forfeit). Two seats knocked out in the same
influence-loss chain get distinct, consecutive ordinals.

`computeFinishingPositions(state)` (`packages/game-logic/src/win-condition.ts`)
inverts that into finishing positions: the lone survivor places 1st, then the
eliminated seats are ranked by `eliminationOrder` **descending** — the last
player eliminated is the runner-up. A finished N-player match therefore yields
the distinct positions `1..N`, which `persistMatchResult` feeds straight into
`rateMatch`. TrueSkill sees the true N-way ranking instead of the old
winner=1 / everyone-else-tied-2 approximation.

## Behavior verified by tests (`packages/rating/test/`)

**`rate.test.ts` — 16 tests:**
- 3-player and 6-player free-for-all on fresh accounts:
  - Winner's mu rises; loser's mu drops
  - Every player's sigma drops (the match resolves uncertainty)
  - Finishing-position ordering is reflected in muAfter (1st > 2nd > … > 6th)
  - Mid-finisher mu sits between winner and last
- Upset gains: a low-rated underdog winning gains **more** mu than a
  same-mu-as-favorites player winning would
- Input ordering preserved in output
- Pre-match values carried through to `RatingDelta.muBefore` / `sigmaBefore`
- Input not mutated
- Rejection paths: <2 seats, non-finite mu, non-positive sigma, non-integer
  finishingPosition

**`display.test.ts` — 6 tests:**
- `mu − 3·sigma` rounded correctly for various inputs
- Half-value rounding (JS Math.round = floor(x + 0.5))
- Fresh-account boundary (returns 0)
- Mature accounts (high mu / low sigma → high integer rating)
- Negative outputs for very weak players
- Always returns an integer

## Dependencies

- `ts-trueskill` ^4 — the actual TrueSkill implementation (v4.2.3 currently)

`ts-trueskill` itself depends on `ts-gaussian`. Both pure-TypeScript, no
native binaries — Workers-safe.

## v1 limitations / TBD

- **No team mode.** TrueSkill supports multi-player teams; we always pass
  single-player teams because Coup is free-for-all PvP (SKILL.md § 1 bans
  co-op / team play).
- **No retroactive recalculation.** If a match's outcome changes (it
  shouldn't, but in case of a server-side correction), the wrapper has no
  built-in way to undo + re-apply. Caller would need to compute the inverse
  delta and apply.
- **No rate-limit on rating writes.** The DO's `endGame()` is the only call
  site; the rate per active match is naturally bounded by the 15-minute game
  duration. No additional rate limiting here.

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 3.6 (TrueSkill + Match Persistence), § 2 (TrueSkill in the locked stack)
- **Where rating fits in the action lifecycle:** [`state-machine.md`](./state-machine.md) — the post-`GAME_OVER` flow (after `checkWinner` returns a winner, the DO's endGame() is called)
- **Finishing-position derivation:** `computeFinishingPositions` in `packages/game-logic/src/win-condition.ts` (tested in `win-condition.test.ts`)
- **Why TrueSkill is the only legal pick (no Elo / Glicko-2):** [`anti-hallucination.md`](./anti-hallucination.md) — Rating section
- **The "MMR write is the last step of endGame()" rule:** [`coding-patterns.md`](./coding-patterns.md) § 16; [`SKILL.md`](../SKILL.md) § 5
- **Persistence target (D1 tables: `users`, `match_players`, `mmr_history`):** planned `references/db-schema.md` + `packages/db/` (not yet implemented)
- **Source:** `packages/rating/src/` — `constants.ts`, `types.ts`, `rate.ts`, `display.ts`
- **Tests:** `packages/rating/test/` — `rate.test.ts` (16 tests), `display.test.ts` (6 tests)
