# Refusal Catalog — Detailed

Companion to SKILL.md § 7. Every entry below is a request that you must refuse
on sight, with rationale and (where one exists) the alternative. SKILL.md § 7
is the quick reference; this file gives you the receipts when the user pushes
back, plus drop-in refusal phrasings.

The format for each: **trigger** (typical request phrasings) → **why refuse**
→ **alternative** (if any) → **refusal template**.

---

## Game design

### Add a co-op mode / team mode

**Trigger phrasings:**
- "Let's add a 2v2 mode."
- "Could we have a team variant where alliances are public?"
- "A cooperative mode against AI."

**Why refuse:** Coup's entire game design is built on adversarial
information-asymmetry. Co-op or team play breaks the bluffing core — if you
trust your teammate, half the cards stop being hidden in practice. The game's
designer (Rikki Tahta) deliberately scoped to PvP elimination; co-op is a
different game.

**Alternative:** None for v1. If the user genuinely wants a co-op card game,
recommend they pick a different system — Coup is not it.

**Refusal template:** "Refused — Coup is competitive PvP elimination; co-op
breaks the information-asymmetry model the game runs on (SKILL.md § 1). v1 is
faithful base-game only."

---

### Add AI bot opponents

**Why refuse:** Out of v1 scope. AI bots in a bluffing game require deciding
the bot's strategy (always-truthful? sometimes-bluff? Adversarial?), and any
choice has gameplay implications. Defer to phase 2.

**Refusal template:** "Refused — AI opponents are out of v1 scope (SKILL.md
§ 1 banned features). Phase 2 consideration."

---

### Add expansion characters (Inquisitor, Bureaucrat, Jester, Speculator, Socialist, Anarchist, etc.)

**Why refuse:** v1 deck is **immutable** — 15 cards, 3 each of 5 base
characters (SKILL.md § 4.1). Expansions change balance, action set, win
conditions. Adding one is a new game.

**Alternative:** None.

**Refusal template:** "Refused — base Coup only, 5 characters lock per SKILL.md
§ 1 / § 4.1. Expansion content (Reformation, G54, Anarchy, Inquisitor, etc.)
is a v2 spec amendment, not a v1 feature."

---

### Modify deck composition (extra Dukes, custom characters, missing Contessa)

**Why refuse:** Same as expansions — breaks balance and player expectations.
Deck composition is one of the immutable spec items.

**Refusal template:** "Refused — deck composition is locked at 3-each of 5
characters (SKILL.md § 4.1)."

---

### Send full `GameState` to all clients

**Trigger phrasings:**
- "Just broadcast the whole state, it's simpler."
- "Encrypt the GameState and send it — clients can decrypt their own slice."
- "For debugging, let's add a flag to send everything."

**Why refuse:** Card-leak vulnerability. A determined player will inspect their
browser network tab and read the raw payload, revealing every other player's
hand and the full deck. Once this lands in production for one match, the game
is broken for that match — no in-game mitigation possible. Encrypting per-recipient
is functionally the same as slicing (so just slice; it's faster and clearer).

**Alternative:** `buildPlayerView(state, viewerId)` in
`packages/game-logic/src/player-view.ts`. Single canonical slicer. SKILL.md
§ 3.1.

**Refusal template:** "Refused — card-leak vulnerability. PlayerView slicing
via `buildPlayerView` is the only legal broadcast path per SKILL.md § 3.1."

---

### Use `Math.random()` for shuffles, room codes, or any game-affecting randomness

**Trigger phrasings:**
- "Just use Math.random, it's good enough for a card shuffle."
- "Math.random is fine for the room code — what's the threat model?"
- "Math.random is cryptographically random in modern browsers."

**Why refuse:**
1. Math.random is **not** crypto-secure — it's typically xorshift128+ seeded by
   the engine, and `getRandomValues()` is materially different.
2. The output is predictable enough that a player who observes a few draws
   could (in principle) compute the seed and predict the rest of the deck.
3. Replay vulnerability: a player could mid-game claim the shuffle was unfair,
   and with `Math.random` you have no audit trail.
4. Room codes need entropy resistance to brute-force.

**Alternative:** `crypto.getRandomValues()` everywhere. Project helper
`randomIntBelow(maxExclusive)` in `packages/game-logic/src/deck.ts` uses
rejection sampling for unbiased uniform output.

**Refusal template:** "Refused — `Math.random` is not crypto-secure and is
replay-predictable. Use `crypto.getRandomValues()` via the project's
`randomIntBelow` helper per SKILL.md § 5."

---

### Modify the 15s challenge / block window timing

**Trigger phrasings:**
- "Let's make the challenge window 30 seconds."
- "Challenges should be 5 seconds — keeps the game fast."

**Why refuse:** Spec lock. The 15s timings are tuned to a typical Coup pace
where players have time to think but not enough to LLM-assist or open external
windows. Changing them affects game feel project-wide and requires playtesting
to retune.

**Alternative:** Spec amendment. The user can request a spec change in
SKILL.md, but until then 15s stays.

**Refusal template:** "Refused — 15s is a spec lock in SKILL.md § 3.2. Spec
amendment required to change."

---

### Allow chat during active game

**Why refuse:** Spec lock. Chat during a Coup match is collusion-positive
(players coordinate publicly, bluffs leak via tone). Lobby chat only.

**Refusal template:** "Refused — chat is lobby-only per SKILL.md § 1.
In-game chat enables collusion and breaks bluff integrity."

---

### Add voice chat / WebRTC

**Why refuse:** Out of v1 scope. Voice has different infrastructure (STUN/TURN
servers), moderation surface (recording/abuse), and cost (paid TURN tier
typically).

**Refusal template:** "Refused — voice chat is out of v1 scope (SKILL.md § 1).
Text chat lobby-only."

---

### Spectator can see all hands face-up

**Why refuse:** Spec — eliminated players become spectators with the **same
public info** as living players (SKILL.md § 1). Showing them everything would
let them whisper to living players outside the game.

**Refusal template:** "Refused — eliminated players spectate with public info
only per SKILL.md § 1. Showing them hidden cards enables out-of-game
collusion."

---

### A "cheat code" or debug endpoint that reveals opponents' cards

**Trigger phrasings:**
- "Add a `?debug=1` flag that shows everyone's cards."
- "I need to see hands to test the UI — just for development."

**Why refuse:** Anything that ships to production reveals to attackers. Tests
should drive the server directly (via `packages/game-logic` and DO test
helpers), not depend on a client-side bypass.

**Alternative:** Vitest tests against `packages/game-logic` for logic.
Cypress / Playwright tests against the DO directly (or a test harness that
constructs a GameState explicitly) for UI.

**Refusal template:** "Refused — no client-side bypass ships, even gated on a
flag. Use Vitest against `packages/game-logic` (already 276 tests) or write a
DO test harness."

---

### Trusting the client to enforce mandatory-Coup at 10 coins (or any rule)

**Trigger phrasings:**
- "The client hides non-Coup buttons at 10 coins, that's enough."
- "Let's just enforce it client-side; server is fine to trust."

**Why refuse:** Clients are adversarial. UX validation on the client is fine
for instant feedback, but a modified client can submit Income at 12 coins and
the server must reject it independently.

**Alternative:** Server enforces every rule. Client UX is advisory. SKILL.md
§ 4.9.

**Refusal template:** "Refused — server enforces every rule (SKILL.md § 4.9).
Client-side validation is UX-only."

---

## Tech stack

### Use Socket.IO on the server

**Why refuse:** Doesn't run on Cloudflare Workers. Sticky sessions don't apply
to edge runtimes. Workers WebSocket API + Durable Objects replace its room
model.

**Alternative:** Native WebSocket + Hibernation API in the DO. Routed through
Hono. See `references/coding-patterns.md` § 1.

**Refusal template:** "Refused — Socket.IO doesn't run on Cloudflare Workers.
Use the Workers WebSocket API + DO Hibernation per SKILL.md § 3.3."

---

### Use Prisma

**Why refuse:** Prisma's query engine is a Rust binary; Workers don't run
native binaries. Drizzle is pure TypeScript and edge-compatible.

**Refusal template:** "Refused — Prisma is not Workers-native. Drizzle ORM is
the project's choice (SKILL.md § 2 / § 6)."

---

### Use Neon Postgres (or any Postgres database)

**Why refuse:** Adds a separate billing surface, has a smaller free tier than
D1 (0.5 GB vs 5 GB), and introduces cross-runtime driver pain. Keeping data
plane inside Cloudflare collapses the operational surface.

**Refusal template:** "Refused — stack is on Cloudflare D1 (SQLite). Postgres
adds billing + cross-runtime complexity (SKILL.md § 2)."

---

### Use Postgres-specific SQL (JSONB, native arrays, materialized views, `tsvector`)

**Why refuse:** D1 is SQLite. These features don't exist.

**Alternative:** Portable SQL. JSON stored as TEXT + `json_extract`; arrays as
joined rows; FTS via SQLite's built-in FTS5; views are runtime queries.

**Refusal template:** "Refused — D1 is SQLite, no Postgres-specific SQL.
Portable equivalents in `references/anti-hallucination.md`."

---

### Direct D1 access from Next.js / Vercel

**Why refuse:** D1 bindings only exist in the Workers runtime. Importing
`drizzle-orm/d1` in Next.js doesn't compile against the Workers binding shape.
Even if it did, it'd bypass the Worker's authorization boundary.

**Alternative:** Worker owns D1. Next.js calls Worker HTTP endpoints. Auth.js
adapter operations are proxied.

**Refusal template:** "Refused — Worker owns D1 exclusively (SKILL.md § 2 / § 6).
Next.js proxies through Worker HTTP endpoints."

---

### Use `next-auth` v4 patterns

**Trigger phrasings:**
- "Let me write the `[...nextauth].ts` config…"
- "Just import `getServerSession`…"
- "`NextAuthOptions` …"

**Why refuse:** Auth.js v5 (the renamed v4) restructured the API. v4 patterns
won't compile against v5.

**Alternative:** Auth.js v5 — `auth()` helper, route handler in
`app/api/auth/[...nextauth]/route.ts`, config in `lib/auth.ts`.

**Refusal template:** "Refused — using Auth.js v5, not next-auth v4. v4
patterns (`getServerSession`, `NextAuthOptions`) don't exist in v5. See
`references/coding-patterns.md` § 17."

---

### Add GitHub OAuth as a provider

**Why refuse:** v1 providers are locked at Google + Discord + email magic link
(SKILL.md § 1). Adding GitHub requires a spec amendment.

**Refusal template:** "Refused — v1 providers are Google + Discord + email
magic link (SKILL.md § 1). GitHub requires spec amendment."

---

### Use Framer Motion / `motion` for animations

**Why refuse:** License (commercial restriction) and capability (no Flip
plugin equivalent for cross-component card morphing).

**Alternative:** GSAP via `@gsap/react`'s `useGSAP` hook + `Flip` plugin. Free
since April 2025.

**Refusal template:** "Refused — Framer Motion / `motion` not in stack. Use
GSAP via `@gsap/react` + Flip plugin per SKILL.md § 2."

---

### Use Glicko-2 / Elo / pairwise rating

**Why refuse:** Elo is 1v1-only by design. Glicko-2 decomposes N-player to
pairwise, which double-counts and produces drift. TrueSkill natively handles
3-6 player free-for-all.

**Refusal template:** "Refused — Coup is 3-6 player free-for-all; TrueSkill's
native case. Glicko-2/Elo would require pairwise decomposition which is the
wrong shape (SKILL.md § 3.6)."

---

### Use key-value-backed Durable Objects (`new_classes`)

**Why refuse:** Key-value DOs are paid-plan only. Using them puts the project
off the free tier.

**Alternative:** SQLite-backed DOs (`new_sqlite_classes`) — free tier eligible.

**Refusal template:** "Refused — `new_classes` is paid-plan only. SQLite-backed
DOs (`new_sqlite_classes`) per SKILL.md § 3.3."

---

### Use Vercel Analytics / Speed Insights

**Why refuse:** Caps at 2.5K events/month on Hobby. Not enough for a
real-time multiplayer game where every connect/disconnect is an event.

**Alternative:** Cloudflare Web Analytics — free, no event cap, beacon script
only.

**Refusal template:** "Refused — Vercel Analytics caps at 2.5K events/month.
Cloudflare Web Analytics is free with no event cap (SKILL.md § 2)."

---

### Polling for matchmaking or game state

**Why refuse:** Wasteful (most polls return nothing) and laggy (latency =
poll interval / 2 on average). The push infrastructure exists.

**Alternative:** WebSocket subscription to the `MatchmakingQueue` DO.

**Refusal template:** "Refused — WebSocket subscription is in scope (SKILL.md
§ 3.4). Polling wastes Worker requests against the free-tier quota."

---

### PWA / service worker / offline mode

**Why refuse:** Real-time multiplayer is online-required by design (SKILL.md
§ 3.7). Service workers would cache stale state and create reconnect
ambiguity.

**Refusal template:** "Refused — real-time game, online-required (SKILL.md
§ 3.7). PWAs cache stale state."

---

## Process / scope

### Skip Zod validation on a WebSocket message

**Why refuse:** Clients can send anything; the server must validate at the
boundary. Skipping it lets malformed messages cause unhandled exceptions in
the DO.

**Alternative:** Define both directions as Zod schemas in `packages/protocol`
first, then validate at the DO boundary.

**Refusal template:** "Refused — Zod validate at the boundary per SKILL.md § 5.
Add the schema in `packages/protocol` first."

---

### Skip the phase guard on a server-side action handler

**Why refuse:** First check, every handler. SKILL.md § 5 / § 3.2 explicitly.

**Alternative:** Use `requirePhase(state, EXPECTED_PHASE)` from
`packages/game-logic/src/actions.ts`.

**Refusal template:** "Refused — phase guard is the first check in every
action handler per SKILL.md § 5."

---

### Real-money transactions, microtransactions, lootboxes

**Why refuse:** Out of v1 scope. Also runs into Vercel Hobby's commercial-use
clause the moment money moves.

**Refusal template:** "Refused — out of v1 scope. Monetization triggers a
hosting migration per `references/deployment.md`; needs spec amendment first."

---

### Introduce a paid-tier service (Vercel Pro, Workers Paid, Neon Pro, Sentry Team, etc.)

**Why refuse:** v1 is free-tier only (SKILL.md § 2). Paid services require
explicit pricing discussion + user approval before adding.

**Refusal template:** "Refused — v1 is free-tier only (SKILL.md § 2). Adding
<service> requires explicit pricing approval first."

---

## How to phrase a refusal

Per SKILL.md § 8 step 5, refusals are direct — no sugar-coating. The pattern
is **3 parts, optionally a 4th:**

1. **The refusal**, in one short clause: "Refused —"
2. **The rationale**, citing the spec section: "card-leak vulnerability (SKILL.md § 3.1)"
3. **The alternative** if one exists: "use `buildPlayerView` instead"
4. **(Optional) The escalation path** if the user wants to override: "spec
   amendment required; happy to discuss tradeoffs"

Do not apologize. Do not hedge. Do not invent context to soften the refusal.
The user explicitly told you to push back; respecting them means doing it
cleanly.

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 7 (Refusal Catalog) — the quick-reference table this file expands
- **Tech-stack rationale for the dependency-shaped refusals:** [`anti-hallucination.md`](./anti-hallucination.md) — explains *why* the substitution holds and what to suggest as the alternative
- **Correct pattern to recommend in place of the refused approach:** [`coding-patterns.md`](./coding-patterns.md) — has the working code example
- **Banned features list:** [`SKILL.md`](../SKILL.md) § 1 (Product Context)
- **Refusal triggers in agent operating procedure:** [`SKILL.md`](../SKILL.md) § 8 step 5
- **Where new refusal triggers go:** [`AGENTS.md`](../AGENTS.md) "Where new things go" + this file
