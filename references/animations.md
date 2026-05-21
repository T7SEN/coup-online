# Animations — GSAP motion

The web client's motion layer. Companion to SKILL.md § 2 (GSAP in the locked
stack) and [`design-system.md`](./design-system.md). Lives in `apps/web`.

> **Status — motion is ON.** `MOTION_ENABLED` in `components/motion.tsx` is
> `true`. Every animation below is implemented and gate-verified (typecheck +
> lint + build). The *visual* tuning — exact durations, easings, particle
> counts, glow intensities — still wants a pass on real hardware; motion is
> cosmetic and never gates game state (see the hard rule below), so tuning is
> safe to do incrementally. Flip `MOTION_ENABLED` to `false` to run fully static.

---

## Stack

- **`gsap`** (core — the `Flip` and `ScrollTrigger` plugins ship inside the package) + **`@gsap/react`**
  for the **`useGSAP`** hook. GSAP is 100% free (Webflow stewardship, April 2025);
  no paid plugins. **No Framer Motion / `motion`** (SKILL.md § 2).
- Every animation goes through **`useGSAP`** — never a raw `useEffect` + `gsap`.
  `useGSAP` scopes selector lookups and reverts every tween it created on unmount
  or dependency change.
- Animate **`transform` + `opacity` only**. Never `filter: blur()` (SKILL.md § 5
  — mobile WebView repaint cost). Glows are radial-gradient + `box-shadow`
  layers; particles are DOM nodes tweened on transform. No WebGL, no canvas.

## Reduced motion

Every animation is gated on `gsap.matchMedia()` with the query `NO_REDUCED_MOTION`
(`(prefers-reduced-motion: no-preference)`), exported from `components/motion.tsx`.
A reduced-motion visitor's `mm.add` callback never fires — the element sits at
its final state. `CoinCount` snaps to the new value; `Glow` snaps opacity;
`burstParticles` and the parallax handler are skipped (`motionAllowed()` is
false). Pointer parallax is additionally skipped on coarse (touch) pointers.

## Hard rule — motion is cosmetic

Animation never gates game state. The server is authoritative; each `state-update`
replaces the `PlayerView`. A `useGSAP` tween animates *from* an offset *to* the
element's natural rendered state — if a fresh state-update interrupts it,
`useGSAP` reverts and the element snaps to the correct state. Motion can never
desync or block the game.

## What's animated

| Moment | Where | Trigger |
|---|---|---|
| Deal-in (table ease + card stagger, slight rotation) | `GamePanel` (`client.tsx`) | the board mounts (match start) |
| Pointer parallax (table contents drift vs. cursor) | `GamePanel` | `pointermove` over the table (pointer devices only) |
| Turn spotlight (candlelight `Glow` + pulse) | `SeatCard`, `PlayerHand` | `isTurn` becomes true |
| Coin roll | `CoinCount` (`motion.tsx`) | a seat's `coins` value changes |
| Phase flash + challenge particle puff | `CourtCenter` (`client.tsx`) | `view.phase` changes (covers action declared / challenge / block / turn-end) |
| Countdown ring drain | `TimerRing` (`timer-ring.tsx`) | a timed phase opens (`timerEndsAt`) |
| Card flip on reveal (true two-faced 180° flip) | `CardFace` (`influence-card.tsx`) | a card's status becomes `revealed` (hidden → revealed) |
| Elimination (slump + ash particle burst) | `SeatCard`, `PlayerHand` | a seat's `isAlive` becomes false |
| Panel entrance | `AppearOnMount` wrapping each action bar | the bar mounts (phase change) |
| Hero atmospheric scene — atmosphere fades in, the manuscript frame settles + corner lozenges pop, the headline rises word by word; motes drift (ambient) and cursor parallax drifts the frame + mote layers | `HeroSection` (`components/site/`) | section mounts; ambient + parallax run after the entrance |
| "How it plays" animated turn demo — a looping stage plays out a turn (claim → challenge → influence lost: card lifts + glows, 2D `scaleX` flip-reveal, then dims + tilts away); a subtle backing panel fades in behind whichever beat is active | `HowItPlaysSection` | section scrolls into view (ScrollTrigger), loops, pauses off-screen |
| "The court" entrance (card deal — cards burst from centre with a spin + overshoot); the pointed-at card spotlights and tilts 3D toward the cursor | `TheCourtSection` | section scrolls into view (ScrollTrigger) |
| Closing entrance (vignette fades in, kicker drops, the monumental heading zoom-settles, lede rises, button pops, footer rises) | `ClosingSection` | section scrolls into view (ScrollTrigger) |
| Section reveal (fade + rise) — Rules, Privacy, Terms, Changelog pages | `RevealSection` (`components/site/`) | a section scrolls into view (ScrollTrigger) |
| Play-hub entrance — header reveals, then the three option cards are "dealt" onto the table (drop + rotate + settle overshoot), then their icon medallions pop | `PlayHub` (`app/(site)/play/`) | page mounts |
| 404 entrance — vignette fades, the "404" card pops in, its corner lozenges pop, then the copy + buttons rise | `not-found.tsx` (`app/`) | the 404 page mounts |
| Support-page entrance — header reveals, the privileges gallery rises, then the close lifts; flipping a privilege card slides the next one in (direction-aware) | `SupportContent` (`app/(site)/support/`) | page mounts; the gallery card on every index change |
| About-page entrance — header reveals, the at-a-glance facts pop in, the story cards rise one by one, then the close lifts | `AboutContent` (`app/(site)/about/`) | page mounts |
| Hall of Patrons — the honour roll. A vertical parchment scroll with twin gold rod-caps; the scroll body is scrollable inside itself so the whole page fits in the viewport (slim gold-tinted webkit scrollbar, top + bottom fade-edge mask). Entrance: header reveals (kicker → title → rule → lede), the scroll unfurls from the top rod (scaleY from origin top), the rod caps + finials pop in, the ten entries stagger in line by line, then the close lifts. Ambient (continuous): the four rod-cap finials twinkle out-of-phase. Hover (or keyboard-focus) an entry: the numeral and name gild, a flourish line + lozenge unfurl on the right, and the ruling line beneath gilds. | `HallContent` (`app/(site)/patrons/`) | page mounts; ambient loops after entrance |
| Maintenance entrance — the centrepiece hourglass scales in (back ease), the radial vignette behind it fades, header rises (kicker → title → rule → lede), the two status cards rise (stagger), then the actions rise. Ambient (continuous): three gold sand grains drift from the upper bulb through the pinch into the lower bulb on staggered loops (each on its own rhythm); the hourglass itself rocks ±1.2° on a slow loop | `MaintenanceContent` (`app/(site)/maintenance/`) | page mounts; ambient loops after entrance |
| Page transition (cross-fade) | `app/(site)/template.tsx` | every navigation within the `(site)` group |
| Game-over flourish (heading spring, gold burst, standings stagger). Patrons with the victory-flourish privilege get a second, denser shower (~480 ms after the first burst) — only fires for the actual winner | `OverPanel` (`client.tsx`) | the over-panel mounts |

## Motion primitives — `components/motion.tsx`

- **`MOTION_ENABLED`** — the global kill-switch; every animation site early-returns when it is `false`.
- **`NO_REDUCED_MOTION`** — the media-query constant for `gsap.matchMedia`.
- **`motionAllowed()`** — `true` when motion is enabled AND the visitor has not
  asked for reduced motion. SSR-safe (no `window` → false). Used by imperative
  helpers that run outside a `useGSAP` matchMedia scope.
- **`AppearOnMount`** — wraps children; fades + slides them up on mount.
- **`CoinCount`** — an integer that rolls to a new `value`; snaps under reduced motion.
- **`Glow`** — an absolutely-positioned, aria-hidden radial-gradient "candlelight"
  layer that eases in/out as `active` flips. `tone`: `gold` / `oxblood` / `ash`.
  Drop into a `position: relative` parent.
- **`burstParticles(host, opts)`** — imperative one-shot: a pool of small DOM
  dots fly outward from the centre of `host` and fade, then the layer removes
  itself. `host` must be `position: relative`. No-op under reduced motion.
  `tone`: `gold` (positive) / `oxblood` (challenge) / `ash` (elimination).

## Key components

- **`TimerRing`** (`components/timer-ring.tsx`) — the 15s countdown as a depleting
  SVG ring. The stroke is GSAP-driven for a smooth 60fps drain (independent of
  the 250ms React clock); turns oxblood and pulses under 5s.
- **`InfluenceCard`** (`components/influence-card.tsx`) — a true two-faced flip
  card. Front face = the named character art (`public/cards/<name>.svg`); back
  face = `back.svg`. The inner element rotates 180° (back → front) on
  hidden → revealed — a genuine flip, not a one-sided swing.
- **`SeatCard` / `PlayerHand`** — wrapped in a `relative` host carrying a `Glow`
  for the turn spotlight; an elimination `useGSAP` slumps the seat and fires an
  ash `burstParticles` when `isAlive` drops.

## Conventions

- `'use client'` on any component that calls `useGSAP`.
- Capture `ref.current` into a `const` before use — TS-narrows it non-null.
- Return `() => mm.revert()` from the `useGSAP` callback.
- `useGSAP` with no `dependencies` runs once on mount; pass `dependencies` to
  re-run on a value change (`[isTurn]`, `[showsBack]`, `[view.phase]`, `[endsAt]`).
- The deal-in targets `[data-card]` — the `data-card` attribute on each
  `InfluenceCard` trigger. `OverPanel` targets `[data-over-heading]` / `[data-standing]`.

## Needs tuning / deferred

- **Visual tuning pass** — durations, easings, particle counts and glow
  intensities are first-cut values; refine on real hardware (esp. a 360px
  low-end device).
- **Deal-in** is an enhanced stagger (cards rise + rotate into place), *not* a
  literal per-card `Flip` travel out of the Court Deck stack — true shared-element
  `Flip` deck → hand travel is still deferred (needs the deck-stack and seat
  cards to share a layout pass).
- **Action / challenge / block beats** are unified into one `CourtCenter`
  phase-flash (+ oxblood particles on challenge windows) rather than bespoke
  per-moment effects (shockwave ring, block parry flourish). Splitting them out
  is a future polish step.
- **Board depth** beyond pointer parallax — a slight table `rotateX` and
  per-element `translateZ` layering — is not yet applied.
- Phase-transition crossfades; the Court Deck → hand card travel on Exchange.

## See also

- **GSAP in the stack:** [`SKILL.md`](../SKILL.md) § 2
- **The visual layer:** [`design-system.md`](./design-system.md)
- **Source:** `apps/web/components/motion.tsx`, `timer-ring.tsx`,
  `influence-card.tsx`, `seat-card.tsx`, `player-hand.tsx`; the `useGSAP` calls
  in `app/room/[matchId]/client.tsx`; the landing-page section entrances in
  `apps/web/components/site/*-section.tsx`.
