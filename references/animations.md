# Animations — GSAP motion

The web client's motion layer. Companion to SKILL.md § 2 (GSAP in the locked
stack) and [`design-system.md`](./design-system.md). Lives in `apps/web`.

> **Status — motion is currently OFF.** The animations below are implemented
> but switched off via the `MOTION_ENABLED` kill-switch in
> `components/motion.tsx`, pending a tuning pass; the app runs fully static.
> Flip `MOTION_ENABLED` to `true` to re-enable.

---

## Stack

- **`gsap`** (core — the `Flip` plugin ships inside the package) + **`@gsap/react`**
  for the **`useGSAP`** hook. GSAP is 100% free (Webflow stewardship, April 2025);
  no paid plugins. **No Framer Motion / `motion`** (SKILL.md § 2).
- Every animation goes through **`useGSAP`** — never a raw `useEffect` + `gsap`.
  `useGSAP` scopes selector lookups and reverts every tween it created on unmount
  or dependency change.

## Reduced motion

Every animation is gated on `gsap.matchMedia()` with the query `NO_REDUCED_MOTION`
(`(prefers-reduced-motion: no-preference)`), exported from `components/motion.tsx`.
A reduced-motion visitor's `mm.add` callback never fires — no movement, the
element sits at its final state. `CoinCount` additionally snaps to the new value.

## Hard rule — motion is cosmetic

Animation never gates game state. The server is authoritative; each `state-update`
replaces the `PlayerView`. A `useGSAP` tween animates *from* an offset *to* the
element's natural rendered state — if a fresh state-update interrupts it,
`useGSAP` reverts and the element snaps to the correct state. Motion can never
desync or block the game.

## What's animated (first pass)

| Animation | Where | Trigger |
|---|---|---|
| Card flip on reveal | `CardFace` (`influence-card.tsx`) | a card's status becomes `revealed` |
| Deal-in | `GamePanel` (`client.tsx`) | the board mounts (match start) |
| Turn spotlight | `SeatCard`, `PlayerHand` | `isTurn` becomes true |
| Coin roll | `CoinCount` (`motion.tsx`) | a seat's `coins` value changes |
| Panel entrance | `AppearOnMount` wrapping each action bar | the bar mounts (phase change) |

## Motion primitives — `components/motion.tsx`

- **`MOTION_ENABLED`** — the global kill-switch; every animation site early-returns when it is `false`.
- **`AppearOnMount`** — wraps children; fades + slides them up on mount.
- **`CoinCount`** — an integer that rolls to a new `value`; snaps under reduced motion.
- **`NO_REDUCED_MOTION`** — the media-query constant for `gsap.matchMedia`.

## Conventions

- `'use client'` on any component that calls `useGSAP`.
- Capture `ref.current` into a `const` before use — TS-narrows it non-null and
  gives `mm.add`'s callback a stable reference.
- Return `() => mm.revert()` from the `useGSAP` callback.
- `useGSAP` with no `dependencies` runs once on mount; pass `dependencies` to
  re-run on a value change (`[isTurn]`, `[influence.status]`, `[value]`).
- The deal-in targets `[data-card]` — the `data-card` attribute on each
  `InfluenceCard` trigger.

## Deferred

- The countdown timer as a depleting ring.
- True `Flip`-plugin card *travel* — a card flying from the Court Deck into a hand.
- Phase-transition crossfades.

## See also

- **GSAP in the stack:** [`SKILL.md`](../SKILL.md) § 2
- **The visual layer:** [`design-system.md`](./design-system.md)
- **Source:** `apps/web/components/motion.tsx`; the `useGSAP` calls in
  `influence-card.tsx`, `seat-card.tsx`, `player-hand.tsx`, and `client.tsx`.
