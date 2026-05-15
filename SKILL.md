---
name: coup-online
description: Engineering guide for Coup Online — a 3–6 player real-time competitive social-deduction card game adapting Coup (Rikki Tahta, Indie Boards & Cards, 2012) to the web. Repo github.com/T7SEN/coup-online. LOAD for ANY task in this repo: features, fixes, game-rule implementation, action/challenge/block state machine, lobby + matchmaking, TrueSkill rating, WebSocket protocol, Durable Objects, deployment, server actions, auth. Triggers: Coup, social deduction, bluffing card game, Duke, Assassin, Captain, Ambassador, Contessa, influence card, challenge, block, counteraction, Durable Object, DO Hibernation, SQLite-backed DO, matchmaking, TrueSkill, MMR, 3-6 players, hidden information, server-authoritative, PlayerView, Coup Online, T7SEN, GSAP, Flip plugin, Cloudflare D1. Stack: Next.js 16, React 19, Tailwind v4, shadcn/ui, Cloudflare Workers + Durable Objects (SQLite-backed only), Hono, Cloudflare D1 + Drizzle, Better Auth on the Worker (Google + Discord + email magic link), Zod, GSAP + @gsap/react + Flip plugin, ts-trueskill, pnpm workspaces. Free-tier only — no paid services in v1. Enforces patterns invisible to training: server-authoritative card state, per-recipient PlayerView slicing on every broadcast, Hibernation-API WebSockets, SQLite-backed DOs (free-tier requirement), Worker-owned D1 (no direct Next.js D1 access), strict action-state-machine phase guards, mandatory-Coup at 10 coins, challenge-race tie-break by server timestamp, Web Crypto only (no Math.random, no node:crypto), Drizzle on Workers (no Prisma, no Neon), Better Auth co-located with D1 on the Worker (no Auth.js / next-auth at any version), Tailwind v4 CSS-first (no tailwind.config.ts), GSAP for animations (no Framer Motion), TrueSkill for rating (no Elo/Glicko-2), Cloudflare Web Analytics (no Vercel Analytics). Skipping produces card-leak vulnerabilities, illegal game states, replay-poisoned shuffles, broken challenge races, paid-tier bills, or matches that don't update ratings correctly.
---

# Coup Online — Pre-Flight Skill

Canonical agent guide for the Coup Online project — a faithful web adaptation of the Coup card game (Rikki Tahta, 2012) for 3–6 players, real-time, with persistent accounts, public matchmaking, ELO ranking, and spectator mode.

When this skill is loaded, run the pre-flight checklist below before any code or proposal. The game's mechanics dictate the architecture: server authority is non-negotiable, hidden information must be enforced per-player on every state broadcast, and the action lifecycle contains race conditions only the server can resolve. **The project is free-tier only** — no paid services in v1. Most of what looks "obvious" in this stack is wrong (Socket.IO, Prisma, Neon, Framer Motion, `Math.random`, `next-auth` / Auth.js at any version, GitHub OAuth, Vercel Analytics, Glicko-2 / Elo) — read Section 6 before importing.

---

## 0. Agent Pre-Flight (Run Every Request)

Before writing code or proposing changes, complete this checklist:

1. **Scope check** → Does the request involve a Coup expansion (Reformation, G54, Anarchy, Inquisitor, Bureaucrat, Jester, Speculator, Socialist)? If yes → refuse. v1 is **base Coup only**: 5 characters (Duke, Assassin, Captain, Ambassador, Contessa), 15-card deck.

2. **Co-op / variant check** → Does the request imply co-op mechanics, team play, AI opponents, or house-rule modifications? If yes → refuse. Coup is competitive PvP elimination. The game's design is built on adversarial information asymmetry; co-op breaks it entirely.

3. **Server authority check** → Does the request touch card identity, action validation, deck state, or any game rule? If yes → server is the source of truth, period. Clients receive per-recipient `PlayerView` slices. No card identity for any player other than self ever leaves the server.

4. **Hidden information check** → Does the request touch state broadcast? If yes → confirm the broadcast layer strips other players' face-down cards. The shape sent is `PlayerView`, not `GameState`. See Section 3.1.

5. **State machine check** → Does the request involve actions, challenges, or blocks? If yes → load Section 3.2 (action lifecycle). Do not freelance phase transitions; the server is the only entity that advances phases.

6. **Anti-hallucination check** → Read Section 6 before writing imports, env-var references, or framework patterns. The stack has several "obvious" choices that are wrong here.

7. **Protocol validation check** → Does the request add or modify a WebSocket message? If yes → define both directions as Zod schemas in `packages/protocol`. Clients send arbitrary bytes; validate everything at the boundary.

8. **Random / crypto check** → Does the request involve shuffling, room-code generation, IDs, or anything random? If yes → Web Crypto only (`crypto.getRandomValues()`, `crypto.randomUUID()`). Never `Math.random()`. Never `node:crypto` (doesn't exist on Workers).

9. **Free-tier check** → Does the request introduce a new dependency, service, or hosting target? If yes → confirm it has a permanent free tier (not just a trial / credit). v1 budget is **zero dollars**. Paid-tier services require explicit pricing discussion and approval; do not silently introduce them.

When unsure, ask one targeted question rather than guessing. Coup's edge cases (chained challenges, ambassador exchange privacy, mandatory-Coup at 10+ coins, coins-paid-even-if-blocked) compound badly under wrong assumptions.

---

## 1. Product Context

| Attribute | Value |
|-----------|-------|
| Game | Coup (Rikki Tahta, 2012) — base game only, no expansions |
| Players | 3–6 per match |
| Pacing | Real-time, single live session (~15 minutes typical) |
| Lobby | Private rooms (6-char codes) + public matchmaking queue |
| Platform | Web only — desktop + mobile browser |
| Identity | Persistent accounts via Better Auth (email magic link + Google + Discord). **No GitHub provider in v1.** |
| Reconnection | 30s grace, then auto-forfeit (both cards revealed, player eliminated) |
| Communication | Free text chat in lobby only. **No chat during active game.** |
| Eliminated players | Spectator with public info only (same view as living players) |
| Rating | Persistent: TrueSkill (mu/sigma/beta), match history, leaderboards, win rate |
| Package manager | `pnpm` — never npm or yarn |
| Repository | `github.com/T7SEN/coup-online` |
| Cost posture | **Free tier only.** v1 ships on free Vercel Hobby + free Cloudflare Workers/D1/Web Analytics + free Sentry tier + free Resend tier. No paid services allowed without explicit approval. |
| Production URL | Frontend: `https://coups.app` (Vercel). Game server: `https://coup-online-game-server.a-hitelare2.workers.dev` (Cloudflare Workers). See [`references/deployment.md`](./references/deployment.md). |

**Banned features.** Never suggest, scaffold, or reference: co-op modes, AI bot opponents, custom or "house-rule" variants, expansion characters, in-game chat (lobby-only is the spec), voice chat, card trading or gifting, real-money currencies, microtransactions/lootboxes, any mechanic that lets a player see another player's face-down cards before reveal, GitHub OAuth (not in v1 provider list), or paid-tier services without explicit approval. Each of these breaks either the game's design integrity, the v1 scope, or the free-tier budget.

---

## 2. Tech Stack (Locked Versions)

Pinned by `package.json` in each workspace. Do not upgrade as part of feature work. **All entries below are on a permanent free tier — no paid services in v1.**

### Frontend — `apps/web`

- **Runtime:** Next.js `^16` (App Router), React `^19`, TypeScript `^5`
- **Hosting:** Vercel Hobby (free; commercial-use prohibited — when monetization begins, migrate to Cloudflare Pages or upgrade)
- **Styling:** Tailwind CSS `^4` (CSS-first via `globals.css`, no `tailwind.config.*`), `tw-animate-css`, `tailwind-merge`
- **UI:** shadcn/ui (style: `radix-nova`, base: `zinc`, icons: `lucide`), `radix-ui`, `next-themes`
- **Animation:** **GSAP** (`gsap` core) + `@gsap/react` (`useGSAP` hook for React lifecycle correctness) + `Flip` plugin (cross-component morphing for deck → hand → revealed pile). GSAP became 100% free under Webflow's stewardship in April 2025; all formerly-paid Club plugins are unrestricted. **Do not use Framer Motion / `motion` / `motion/react`** — replaced by GSAP for license consistency and animation power.
- **State / forms:** native React 19 (`useActionState`, `useTransition`), Zod, no Redux/Zustand for game state
- **Auth:** **Better Auth** (`better-auth`) — runs on the Worker (same runtime as D1, per SKILL.md § 2). Browsers hit `/api/auth/*` on the Vercel origin; Next.js's `rewrites()` in `next.config.ts` proxies to the Worker so cookies stay on the Vercel origin. Providers: Google + Discord + email magic link via Resend (`better-auth/plugins/magic-link`). **GitHub provider is not configured in v1.** See `references/auth.md`.
- **WebSocket client:** native `WebSocket` API wrapped in a typed client backed by `packages/protocol`
- **Analytics:** **Cloudflare Web Analytics** via beacon script in `<head>`. Free, no event cap. **Do not use Vercel Analytics / Speed Insights** — they cap at 2,500 events/month on Hobby.
- **Observability:** `@sentry/nextjs` (free tier — 5K errors/month)

### Game Server — `apps/game-server`

- **Runtime:** Cloudflare Workers + **SQLite-backed Durable Objects only** (`new_sqlite_classes` in `wrangler.toml`). Key-value-backed DOs require the Workers Paid plan; we use SQLite-backed exclusively to stay on the free tier.
- **Hosting:** Cloudflare Workers Free plan (100K req/day, ~3M DO req/month, 5 GB SQLite storage included)
- **HTTP routing:** `hono` (runs natively on Workers)
- **WebSocket:** Workers WebSocket API + **Hibernation API** (DO sleeps between messages, connections persist, compute drops to zero). Hibernation is **mandatory** — without it, every connected match accrues duration charges and the free tier evaporates.
- **Validation:** `zod` (shared schemas from `packages/protocol`)
- **Random / crypto:** Web Crypto only (`crypto.randomUUID()`, `crypto.getRandomValues()`). No `node:crypto`, no `Math.random()` for game logic.
- **Observability:** `@sentry/cloudflare` (free tier — same 5K errors/month bucket as the frontend)
- **Local dev:** `wrangler dev`

### Persistence — `packages/db`

- **Database:** **Cloudflare D1** (SQLite, accessed via Worker D1 binding). 5 GB free storage, 5M rows read/day, 100K writes/day on the free tier.
- **ORM:** `drizzle-orm` + `drizzle-orm/d1` adapter + `drizzle-kit` migrations
- **Migration tool:** `drizzle-kit generate` (authoring) + `wrangler d1 migrations apply` (deploy)
- **Tables:** `user`, `session`, `account`, `verification` (Better Auth — DB-backed sessions with a 60 s cookie cache), `friend`, `friend_request`, `match`, `match_player`, `mmr_history`
- **Access pattern:** **The Worker owns D1 exclusively.** All D1 reads and writes happen inside `apps/game-server`. Next.js never imports `drizzle-orm/d1` and never receives a D1 binding. Better Auth lives on the Worker with the Drizzle adapter pointed directly at the D1 binding — no HTTP-DB bridge. Next.js proxies `/api/auth/*` to the Worker via `rewrites()`.
- **SQL dialect:** SQLite. **No Postgres-specific features** (no JSONB, no `array` columns, no `RETURNING *` with complex types, no materialized views, no partial indexes with function predicates). Use portable SQL or SQLite-native equivalents.

### Rating — `packages/rating`

- **Algorithm:** **TrueSkill** (Microsoft Research, 2007). Native support for N-player free-for-all matches — the correct fit for 3–6 player Coup.
- **Package:** `ts-trueskill`
- **Defaults:** mu = 25, sigma = 25/3, beta = 25/6, tau = 25/300, draw probability = 0 (Coup has a winner)
- **No Elo, no Glicko-2.** Elo is 1v1-only by design; Glicko-2 decomposes to pairwise. TrueSkill's whole point is N-player; do not "downgrade" to a pairwise scheme.

### Shared packages

- **`packages/protocol`** — Zod schemas + TypeScript types for every WebSocket message (both directions). The contract between web client and game server.
- **`packages/game-logic`** — Pure functions implementing Coup rules. No I/O, no framework dependencies. Vitest-tested.

**Anti-hallucination:** before writing any import, consult Section 6. Common drift items: `socket.io`, `prisma`, `@neondatabase/serverless`, `postgres.js`, `next-auth` / Auth.js (any version), `@auth/*` adapters, `tailwind.config.ts`, `pages/` directory, `node:crypto`, `redis` as primary state store, `express`, `motion` / `motion/react` (Framer Motion), GitHub OAuth, `@vercel/analytics`, `@vercel/speed-insights`, Glicko-2 / Elo math. None belong here.

> **Deep dives:** deployment workflow (account setup, secrets, free-tier limits, monetization migration) is in [`references/deployment.md`](./references/deployment.md). The full anti-hallucination inventory with rationale per substitution is in [`references/anti-hallucination.md`](./references/anti-hallucination.md).

---

## 3. Architectural Pillars

### 3.1 Server-Authoritative Card State + PlayerView Slicing

**No client ever receives another player's face-down card identity.** Clients receive a `PlayerView` — a per-recipient slice of game state where:
- Their own face-down cards are present (so they see what they have).
- Other players' face-down cards are represented as opaque hidden tokens (`{ status: "hidden" }`).
- All face-up (revealed/lost) cards are public to everyone.
- The Court Deck (face-down draw pile) is represented as `{ count: number }` only.

The server holds the full `GameState` in DO storage. Every state mutation runs server-side. Every broadcast iterates over connected players and emits a tailored slice. Use a single utility (`buildPlayerView(state, playerId)`) and use it everywhere — never inline the slicing logic. **Never** broadcast the raw `GameState` to all clients, even temporarily, even encrypted. A determined player will inspect their browser's network tab.

This pattern is invisible to most multiplayer training data, which assumes a single shared state object replicated to all clients. Coup's gameplay is destroyed if that pattern is followed.

### 3.2 Action Lifecycle State Machine

Every player turn proceeds through a strict phase sequence. The server is the only entity that advances phases. Phases:

1. **`AWAITING_ACTION`** — current player picks an action. Server validates: turn ownership, coin sufficiency, mandatory-Coup at ≥10 coins, target validity for targeted actions.
2. **`CHALLENGE_WINDOW`** — 15-second timer. Any other player may challenge the claimed character (if the action requires one). Income, Foreign Aid, and Coup are unchallengeable; only their *blocks* (where applicable) can be challenged.
3. **`CHALLENGE_RESOLUTION`** — challenged player either reveals the claimed card (challenger loses an influence; claimant returns proven card to deck, shuffles, draws a replacement) or fails (claimant loses an influence; action is canceled, coins paid for Assassinate are still spent). **After a successful reveal**, control flows to `BLOCK_WINDOW` if the action is blockable (Steal, Assassinate, Foreign Aid), otherwise the action resolves and flow goes to `TURN_END`. **After a failed reveal** (claimant was bluffing), the action is canceled and flow goes to `TURN_END` (skipping any block window — there's nothing left to block).
4. **`BLOCK_WINDOW`** — 15-second timer. Any player who can legally block claims the blocker character (Duke blocks Foreign Aid; Captain or Ambassador blocks Steal; Contessa blocks Assassinate). If no block declared, action resolves and flow goes to `TURN_END`.
5. **`BLOCK_CHALLENGE_WINDOW`** — 15-second timer. Any player may challenge the block claim. Resolution follows the same rules as `CHALLENGE_RESOLUTION`: proven block → original action is canceled (block stands), failed block → blocker loses an influence and the original action resolves.
6. **`INFLUENCE_LOSS`** — per-player private prompt: "pick which card to lose." Only the losing player sees both their face-down cards on this prompt; everyone else sees only the resulting face-up card after they confirm. Timeout (15s) auto-picks a card.
7. **`EXCHANGE_SELECTION`** — Ambassador-only. Player sees their 2 cards plus 2 drawn from the Court Deck. They pick which 2 to keep; the other 2 return to the deck (re-shuffled server-side). Strictly private — server validates the returned 2 are a valid subset of the 4.
8. **`TURN_END`** — server checks elimination + win condition. Advances turn to next living player.

**Challenge race tie-break:** if two players send `challenge` messages within the same tick, the server's authoritative receive timestamp (`Date.now()` inside the DO) wins. Subsequent challenges in the same window are silently dropped — the client never learns it lost the race except by absence of effect.

**Mandatory-Coup at 10 coins:** if a player starts their turn with ≥10 coins, their only legal action is Coup. The action menu must hide all other options client-side. Server enforces independently — never trust the client.

> **Deep dive:** the full state machine as implemented — per-action lifecycle diagrams, queue/pool semantics for `influenceLossQueue` and `exchangePool`, the complete error-code table, and v1 limitations — is in [`references/state-machine.md`](./references/state-machine.md).

### 3.3 Durable Object Per Room

Each match is one **SQLite-backed** Durable Object instance. Free-tier requirement: key-value-backed DOs are paid-plan-only; we use SQLite-backed exclusively. Declare via `new_sqlite_classes` in `wrangler.toml` migrations — never `new_classes` (that creates key-value-backed DOs and breaks the free tier).

The DO:
- Holds the canonical `GameState` in DO SQLite storage (transactional, durable).
- Manages WebSocket connections via the **Hibernation API** — the DO sleeps between messages, compute drops to zero, connections persist via the runtime. **Hibernation is mandatory** — without it, every active match accrues continuous duration charges and the free tier evaporates.
- Validates every inbound message against the protocol schema + the current state machine phase.
- Broadcasts per-player slices on every state mutation.
- On `TURN_END` if the game is over: writes `matches` + `match_players` + `mmr_history` to D1 (via the Worker's D1 binding), updates each player's TrueSkill rating, and shuts down (releases connections).

Match IDs are server-generated `crypto.randomUUID()`. Private room codes are short human-shareable codes (6 chars, base32 alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no ambiguous chars), mapped to DO IDs in a separate `RoomCodeRegistry` Durable Object (also SQLite-backed).

### 3.4 Matchmaking — Lobby Durable Object

A single global `MatchmakingQueue` Durable Object holds the public queue. Players opting into public matchmaking are added with their MMR. The queue runs a periodic match-fanout (every 2s via DO Alarms) that pairs 3–6 players within an MMR band, spawns a new game DO, and notifies them via their existing WebSocket to switch rooms.

Private rooms skip the queue. The host generates a code via `RoomCodeRegistry`, shares it, joiners enter the code and connect directly to the game DO. Codes expire 30 minutes after creation if no game starts.

### 3.5 Reconnection — 30s Grace

When a player's WebSocket disconnects:
- The DO marks them `disconnected` with a 30s server-side timer (DO Alarm).
- The game **does not pause** unless it's the disconnected player's turn. If it's their turn, the action timer pauses; otherwise the turn proceeds.
- On reconnect within 30s, they rejoin their seat with full `PlayerView` replayed.
- On timeout, the server auto-forfeits: both influence cards revealed face-up, player eliminated, game continues with remaining players.
- If forfeit drops the game below 2 living players, the remaining player wins by default. MMR updates normally.

### 3.6 TrueSkill + Match Persistence

On game end, the server writes (in one D1 transaction):
- One `matches` row (matchId, started_at, ended_at, winner_user_id, seat_count).
- N `match_players` rows (matchId, userId, seat, finishing_position, mu_before, sigma_before, mu_after, sigma_after).
- N `mmr_history` deltas.

Use **TrueSkill** via the `ts-trueskill` package. Defaults: mu = 25, sigma = 25/3, beta = 25/6, tau = 25/300, draw probability = 0. TrueSkill natively models N-player free-for-all matches by treating finishing order as the ranking input — pass `[winner_team, second_team, third_team, ...]` to `rate()` with each team being a single player. Coup has no draws (last player with influence wins outright), so `drawProbability` stays at 0.

**Initial rating** for a new account: mu = 25, sigma = 25/3 (the package defaults). After ~10–20 ranked games, sigma converges and the displayed "skill" (often shown as `mu - 3*sigma` for conservative ranking) stabilizes.

**Displayed rating** on the leaderboard: `mu - 3 * sigma` rounded to nearest integer. This is the conservative estimate (Microsoft's recommended display formula) — never display mu alone, since high-sigma new accounts would appear over-rated.

Persistence is **post-game only** — the DO state is the live source of truth during the match. Match history is readable only by participants. Leaderboards are public top-100. No PII beyond display name and avatar.

**Anti-pattern:** do not decompose 3–6 player matches into pairwise Elo updates. TrueSkill's whole advantage is that it models the full free-for-all in one update. Pairwise Elo over N players double-counts and produces drift.

### 3.7 No PWA, No Offline, No Service Workers

This is a real-time multiplayer game. There is no offline mode and no PWA. The browser must be online with an open WebSocket. Connection-down equals disconnected (see § 3.5). Don't propose Workbox, Serwist, or service workers — they'd cache stale game state and create reconnect ambiguity.

---

## 4. Coup Rules (Definitive)

This section is the source of truth for game rules. If a Wikipedia article, BoardGameGeek post, or house-rules variant contradicts this section, **this section wins** — it locks the rules to base-game v1 scope.

### 4.1 Deck Composition (immutable)

**15 cards, exactly:** 3× Duke, 3× Assassin, 3× Captain, 3× Ambassador, 3× Contessa. No other characters in v1. Server validates deck composition on game init and after every Exchange / challenge-resolution shuffle.

### 4.2 Setup

- Shuffle the 15-card deck server-side using `crypto.getRandomValues()` as the entropy source for a Fisher-Yates shuffle.
- Deal 2 cards face-down to each player. Remaining `15 − 2N` cards form the Court Deck (face-down draw pile).
- Each player starts with **2 coins**.
- Random first player. Turn order is clockwise. Seat order is set at game start and immutable.

### 4.3 General Actions (no character claim required)

| Action | Effect | Challengeable | Blockable by |
|---|---|---|---|
| Income | Take 1 coin | No | — |
| Foreign Aid | Take 2 coins | No | Duke (claim) |
| Coup | Pay 7 coins, target loses an influence | No | — (always succeeds) |

**Coup is mandatory if the acting player has ≥10 coins at turn start.**

### 4.4 Character Actions (claim required)

| Action | Effect | Challengeable | Blockable by |
|---|---|---|---|
| Duke → Tax | Take 3 coins | Yes | — |
| Assassin → Assassinate | Pay 3 coins, target loses an influence | Yes | Contessa (claim) |
| Captain → Steal | Take up to 2 coins from target (or all if target has fewer) | Yes | Captain or Ambassador (claim) |
| Ambassador → Exchange | Draw 2 from Court Deck, keep 2 of the 4-card pool, return 2 to deck (reshuffled) | Yes | — |

**Coins paid even if blocked or challenged-and-lost.** Assassinate's 3 coins are spent at action declaration, not at resolution.

### 4.5 Counteractions (blocks)

Blocks are character claims and follow the same challenge resolution as actions.
- **Duke** blocks Foreign Aid.
- **Contessa** blocks Assassinate.
- **Captain** blocks Steal.
- **Ambassador** blocks Steal.

### 4.6 Challenges

- Any player (not just the action target) may challenge a character claim during its `CHALLENGE_WINDOW` or `BLOCK_CHALLENGE_WINDOW`.
- If the claimant **has** the character: challenger loses an influence. Claimant returns the proven card to the deck, shuffles, draws a fresh card (preserves anonymity for future bluffs).
- If the claimant **does not have** the character: claimant loses an influence. Action (or block) does not resolve. Coins already paid stay paid.
- First server-received challenge wins. Later challenges in the same window are silently dropped.
- **These rules apply identically to challenges of blocks.** A player who claims Duke/Contessa/Captain/Ambassador to block another player's action can be challenged the same way. The block-challenge sequence does not nest further — you cannot challenge a challenge-resolution; the loser of a challenge simply loses an influence, period.

### 4.7 Influence Loss

The losing player picks which of their face-down cards to reveal. The revealed card is flipped face-up permanently (cannot be reshuffled). Two face-up cards = player is eliminated.

Timeout on the per-player `INFLUENCE_LOSS` prompt (15s) auto-picks the leftmost face-down card (deterministic, documented to players via tooltip).

### 4.8 Win Condition

Last player with at least one face-down card wins. Game ends immediately upon elimination of the second-to-last player.

### 4.9 Forced Coup at 10+ Coins

If a player **starts their turn** with ≥10 coins, their only legal action is Coup. Client action menu hides all other options. Server enforces independently — clients are advisory only.

---

## 5. Critical Patterns to Apply Automatically

Apply without prompting. These are codebase-wide conventions.

- **Per-player state slicing** on every broadcast. Build via `buildPlayerView(state, playerId)`; never inline.
- **Zod-validate every WebSocket message** at the DO boundary, both inbound and outbound. Clients can send anything.
- **Phase guards on every action handler.** First check: `if (state.phase !== EXPECTED_PHASE) throw new IllegalPhaseError(...)`. Server-side, enforced before any state mutation.
- **Action timer pauses on disconnect of the acting player only.** All other timers continue.
- **`crypto.getRandomValues()` for shuffles**, never `Math.random()`. Same for room codes, match IDs (or `crypto.randomUUID()` for IDs).
- **Drizzle migrations are checked in.** Never edit a shipped migration; add a new one. Generate with `drizzle-kit generate`; apply to D1 via `wrangler d1 migrations apply <db-name> --remote` (or `--local` for dev). Migrations live under `packages/db/drizzle/migrations/`.
- **`'use server'` files export only async functions.** Constants live in `*-constants.ts`.
- **`cookies()` and `headers()` are async in Next.js 16** — `await` them.
- **`useSearchParams()` requires a `<Suspense>` boundary** at the page level (Next 16 prerender bailout).
- **Optimistic UI** is for client-side ack only (e.g., grey out the "Challenge" button after clicking). Never optimistic-render server-truth state. Wait for the broadcast.
- **Card animations** use GSAP via `@gsap/react`'s `useGSAP` hook (lifecycle-safe cleanup) and the **Flip plugin** for cross-component morphing (deck → hand → revealed pile). Animate `opacity` and `transform` only; **never animate `filter: blur()`** (mobile WebView repaint cost is catastrophic on lower-end devices). Use `gsap.context()` inside `useGSAP` to scope selectors to the component; revert on cleanup automatically.
- **Mobile-first layout.** Design and test at 360px wide first. Card fans collapse to a stack-with-select on narrow viewports.
- **`dir="auto"` on every user-typed text-bearing element** (chat input, display name, room name). Future-proofs i18n.
- **Sentry on both ends.** `@sentry/nextjs` in `apps/web`, `@sentry/cloudflare` in `apps/game-server`. Tag every event with `matchId` when in a game.
- **No raw `console.*` at call sites.** Use the `logger` utility — `apps/web/lib/logger.ts` and `apps/game-server/src/logger.ts`, both exposing `logger.{debug,info,warn,error}`. `debug` is dev-console-only (no-op in production, never shipped to Sentry); `info`/`warn`/`error` route to the Sentry Logs product; `logger.error(msg, err)` additionally opens a Sentry Issue. Pass structured `attributes` (primitives only) — they're queryable in Logs and ride along as Issue tags (e.g. `matchId`). The logger module itself is the one sanctioned place for `console.*`.
- **MMR write is the last step of `endGame()`** — after all other match-result persistence succeeds. If MMR write fails, retry; do not roll back match data.
- **WebSocket auth — issuance.** Client POSTs to `/api/ws-token` on the Vercel origin; Next.js's `rewrites()` forwards to the Worker's `/api/ws-token` route, which calls Better Auth's `auth.api.getSession({ headers })` to read the session cookie and signs `{ userId, displayName, exp }` with `WS_SIGNING_SECRET` (HS256, 5-minute expiry). Worker owns both signing and verification — Next.js is a transparent proxy.
- **WebSocket auth — verification.** The DO verifies the JWT on every upgrade before accepting the connection. Token in the query string (`?token=...`). Invalid or expired token → 4001 close code. The verified `userId` is bound to the connection for the session.
- **Origin header validation.** On the Worker side, every WebSocket upgrade request must have its `Origin` header validated against an allowlist (production Next.js origin + `localhost:3000` for dev). Reject unrecognized origins with HTTP 403. This blocks cross-origin WebSocket hijacking, which Workers and `Origin`-unvalidated WS servers are vulnerable to.
- **Per-connection rate limiting.** Cap inbound WebSocket messages at 30 per 5-second window per connection. Excess messages dropped server-side, with a `{ type: "rate-limit", retryAfterMs }` error sent back to that connection only. Stops a misbehaving client from burning DO CPU on duplicate challenges.
- **Hydration safety.** Server Components default in Next.js 16 — guard browser-only API access with `typeof window !== 'undefined'` or move it into `useEffect`. `Date.now()` in a render body causes hydration mismatches; use `useState(() => Date.now())` if you need a stable client-side timestamp at mount. Wrap `globalThis` access (`navigator`, `localStorage`) as `globalThis as unknown as { ... }` cast to satisfy strict mode.
- **Document in the right place.** When a task produces a new architectural decision, convention, file-layout choice, dependency pick, or non-obvious pattern, write it to the repo's canonical doc: **SKILL.md** for cross-cutting rules, **`AGENTS.md`** for agent-facing conventions, **`references/*.md`** for deep topic guides (state machine, DB schema, DOs, auth, deployment, animations, rating). If the target file or directory doesn't exist yet, **create it**. Knowledge left only in commit messages or conversation history won't survive — the in-repo docs are the source of truth.
- **Three-gate verification on every code change.** Before reporting any change that touches source code as done, three gates must pass from repo root: `pnpm -r typecheck` (tsc), `pnpm -r lint`, and `pnpm -r build`. Doc-only changes (SKILL.md, AGENTS.md, `references/*.md`, READMEs, plan files) skip — there's no compile/lint/build surface to break. If a workspace doesn't yet have one of the scripts, surface the gap honestly rather than silently skipping; add the missing script if it's reasonable to do so in scope, or flag as a known follow-up. Never `--no-verify` or skip on "it's a small change."
- **`eslint.config.mjs` per workspace sets `tsconfigRootDir`.** In every workspace's flat config, include `languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } }`. typescript-eslint v8's parser otherwise errors in VS Code's ESLint extension with "No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present" because the editor's cwd is the repo root, not the workspace. `pnpm -r lint` from the CLI is unaffected (each workspace runs in its own cwd), so this only surfaces in-editor. When adding a new workspace with its own eslint config, include this block from day one.

> **Deep dives:** each pattern above is expanded with code examples pulled from this codebase plus "what breaks if you skip it" in [`references/coding-patterns.md`](./references/coding-patterns.md). Surface conventions (naming, imports, comments, tests, error handling, formatting, configs) are in [`references/code-style.md`](./references/code-style.md).

---

## 6. Anti-Hallucination Inventory

If a search result, training memory, or autocomplete suggests one of these — it is wrong for this codebase.

| What you might reach for | What this project uses instead |
|---|---|
| `socket.io`, `socket.io-client`, `engine.io` | Native WebSocket + DO Hibernation API. Socket.IO requires sticky sessions; DOs solve presence and per-room state natively. |
| `prisma`, `@prisma/client`, `schema.prisma` | Drizzle ORM with the `drizzle-orm/d1` adapter. Edge-compatible, type-safe, free on Workers. Prisma is not Workers-native. |
| **`@neondatabase/serverless`, `postgres.js`, Neon Postgres** | **Cloudflare D1** (SQLite) via Worker binding + `drizzle-orm/d1`. D1 has a more generous free tier (5 GB vs 0.5 GB), keeps the stack on one platform, and removes the cross-runtime driver problem. |
| **Postgres-specific SQL** (JSONB, native arrays, `RETURNING *` with complex types, materialized views, partial indexes with function predicates, `tsvector`, range types) | **D1 is SQLite.** Use portable SQL or SQLite-native equivalents (JSON stored as TEXT + `json_extract`; arrays as joined rows; FTS via SQLite FTS5 extension). |
| **Direct D1 queries from Next.js / Vercel** (`drizzle-orm/d1` imported in `apps/web`, D1 REST API client) | **Worker owns D1 exclusively.** Next.js never sees a D1 binding. All DB operations live on the Worker. Better Auth runs on the Worker too (Drizzle adapter → D1 binding); Next.js proxies `/api/auth/*` via `rewrites()`. |
| `next-auth` / Auth.js (any version), `@auth/core`, `@auth/drizzle-adapter`, `[...nextauth].ts`, `getServerSession`, `NextAuthOptions` | **Better Auth** (`better-auth`) on the Worker. Auth.js was tried and retired in favor of Better Auth + D1 + Drizzle adapter co-located on Cloudflare. See `references/auth.md`. |
| **GitHub OAuth provider** | **Not in v1.** Providers are Google + Discord + email magic link (via `better-auth/plugins/magic-link` + Resend). Adding GitHub requires explicit spec amendment. |
| `tailwind.config.ts`, `tailwind.config.js` | Tailwind v4 CSS-first. All config in `globals.css` via `@theme` directive. |
| `pages/` directory, `getServerSideProps`, `getStaticProps`, `getInitialProps` | App Router only. Server Components default. |
| `node:crypto`, `crypto` module from Node | Web Crypto: `crypto.randomUUID()`, `crypto.getRandomValues()`. Workers don't have `node:crypto`. |
| `Math.random()` for game logic | `crypto.getRandomValues()` seeding Fisher-Yates. Math.random is not crypto-secure and is replay-poisonous. |
| `redis`, `ioredis`, Upstash as primary state store | Durable Object SQLite storage is the live source of truth during a match. D1 is post-game persistence. Redis is not in the stack. |
| `express`, `fastify` in the game server | Hono. Runs on Workers natively; Express and Fastify don't. |
| `mongoose`, MongoDB | D1 (SQLite) + Drizzle. |
| **`motion`, `motion/react`, `framer-motion`** | **GSAP** via `gsap` core + `@gsap/react`'s `useGSAP` hook + `Flip` plugin for cross-component morph. GSAP became fully free in April 2025 under Webflow's stewardship. |
| **`@vercel/analytics`, `@vercel/speed-insights`** | **Cloudflare Web Analytics** — beacon script in `<head>`, no NPM package, free, no event cap. Vercel Analytics caps at 2.5K events/month on Hobby. |
| **Glicko-2, Elo, K-factor scaling, pairwise rating updates** | **TrueSkill** via `ts-trueskill`. N-player free-for-all is TrueSkill's native case; do not decompose to pairwise. |
| **Key-value-backed Durable Objects** (`new_classes` in wrangler migrations) | **SQLite-backed Durable Objects only** (`new_sqlite_classes`). Key-value DOs are paid-plan-only; SQLite DOs are free-tier eligible. |
| Polling endpoints for matchmaking | WebSocket subscription to the `MatchmakingQueue` DO. Polling is wasteful and laggy. |
| Yjs, Automerge, or any CRDT for game state | Game state is server-authoritative, not collaborative. CRDTs would let clients propose state — exactly what we prevent. |
| `useEffect` for data fetching in Server Components | Server Components don't have effects. Fetch in the async component body. |
| `npm`, `yarn`, `yarn.lock`, `package-lock.json` | `pnpm` and `pnpm-lock.yaml`. Monorepo via pnpm workspaces. |
| `localStorage` for session token | HTTP-only cookies (Better Auth manages these). WebSocket auth is a signed JWT in the upgrade query string, in memory only. |
| Class components, `componentDidMount`, `setState({...})` | Functional components + hooks only. |
| Storing card identities in Redux / Zustand / React state | Server is the truth. Client state is a *cache* of the latest `PlayerView` broadcast — opaque hidden tokens, never inferred identities. |
| WebRTC for game state or chat | Game state goes through the server. WebRTC was considered for voice chat, which is banned. |
| Custom WebSocket libraries (`ws`, `uwebsockets.js`) on the server | Workers WebSocket API + Hibernation. The `ws` package doesn't run on Workers. |
| Per-feature client-side action validation as the "real" check | Server enforces every rule. Client validation is UX-only. |
| Shared `GameState` broadcast to all clients | `PlayerView` per recipient. See § 3.1. |
| **Paid-tier services** (Vercel Pro, Workers Paid, Neon Pro, Sentry Team, Postmark paid, Plausible) | **Free tier only in v1.** Introducing paid services requires explicit pricing discussion and approval. |

> **Deep dive:** rationale per substitution (why D1 over Neon, why GSAP over Framer Motion, why TrueSkill over Glicko-2, etc.) plus a 5-item dependency-add checklist is in [`references/anti-hallucination.md`](./references/anti-hallucination.md).

---

## 7. Refusal Catalog

Refuse these immediately with a one-line rationale. Do not implement, do not ask for clarification, do not "try a workaround."

| Request pattern | Why refuse |
|---|---|
| Add a co-op mode / team mode | Coup is competitive PvP; co-op breaks the information-asymmetry model the game runs on |
| Add AI bot opponents | Out of v1 scope; defer to phase 2 |
| Add expansion characters (Inquisitor, Bureaucrat, Jester, Speculator, Socialist, Anarchist, etc.) | Base game only — v1 scope lock |
| Modify deck composition (extra Dukes, custom characters, missing Contessa) | Base rules are immutable; breaks balance and player expectations |
| Send full `GameState` to all clients | Card-leak vulnerability; violates § 3.1 |
| Use `Math.random()` for shuffles or room codes | Not crypto-secure; replay-predictable; cheaters can pre-compute |
| Modify the 15s challenge / block window timing | Spec lock at 15s — change requires explicit spec amendment, not an in-task adjustment |
| Allow chat during active game | Spec lock — chat is lobby-only |
| Add voice chat / WebRTC | Out of v1 scope; text-only |
| Use Socket.IO on the server | Doesn't run on Cloudflare Workers; DOs replace its room model |
| Use Prisma | Not edge-compatible; Drizzle is the choice |
| Use Neon Postgres or any Postgres database | Stack is on D1 (SQLite); Postgres adds a separate billing surface and cross-runtime driver pain |
| Use Postgres-specific SQL (JSONB, arrays, materialized views) | D1 is SQLite; use portable SQL |
| Direct D1 access from Next.js / Vercel | Worker owns D1; Next.js proxies through Worker endpoints |
| Use `next-auth` / Auth.js (any version) | We're on Better Auth. Skill: better-auth-best-practices. APIs differ entirely. |
| Add GitHub OAuth as a provider | Not in v1 — providers are Google + Discord + email magic link |
| Use Framer Motion / `motion` for animations | GSAP + `@gsap/react` + Flip plugin; license alignment + animation power |
| Use Glicko-2 / Elo / pairwise rating | TrueSkill via `ts-trueskill` — N-player free-for-all is its native case |
| Use key-value-backed Durable Objects | SQLite-backed only (free-tier requirement) |
| Use Vercel Analytics / Speed Insights | Cloudflare Web Analytics — free, no event cap |
| Polling for matchmaking or game state | WebSocket subscription required; polling is wasteful and laggy |
| Client-authoritative action validation ("trust the client to enforce mandatory Coup at 10 coins") | Clients are adversarial; server enforces every rule |
| Real-money transactions, microtransactions, lootboxes | Out of scope; not in spec |
| **Introduce a paid-tier service** (Vercel Pro, Workers Paid, Neon Pro, Sentry Team, etc.) | v1 is free-tier only; paid services require pricing discussion and approval |
| Spectator can see all hands face-up | Spec lock — eliminated/spectators see public info only (§ 1) |
| "Cheat code" or debug endpoint that reveals opponents' cards | No client-side bypass ever ships; tests use the server directly |
| PWA / service worker / offline mode | § 3.7 — real-time game, online-required by design |
| Universal `Math.random` + comment "good enough for shuffle" | Refuse without exception |

> **Deep dive:** typical user request phrasings, full rationale per refusal, alternatives where any exist, and drop-in refusal templates (3-part standard phrasing) are in [`references/refusal-catalog.md`](./references/refusal-catalog.md).

---

## 8. Agent Operating Procedure

When this skill triggers:

1. **Run Section 0 pre-flight.** Refuse if banned or out of scope.
2. **State a plan before code** for any non-trivial change. Name the file paths you'll touch and the symbols you'll edit.
3. **Cite the rules section** when implementing game logic. Format: `// per SKILL.md § 4.4 — Assassin: coins paid even if blocked`.
4. **Apply Section 5 patterns** to every code change automatically. Re-check before submitting.
5. **Push back on bad ideas, including from the user.** Refuse with rationale; offer alternatives. Do not sugar-coat. Examples: user asks for `Math.random()` shuffle → refuse, explain replay determinism + crypto. User asks to relax server authority "for simplicity" → refuse, explain card-leak. User asks for co-op mode → refuse, explain Coup's design.
6. **Surface uncertainty.** If a request is ambiguous, ask one targeted question. Do not invent context.
7. **Test game logic in `packages/game-logic`.** Pure functions, Vitest, CI runs on every push. **Minimum coverage:**
   - Every general action (Income, Foreign Aid, Coup) — success path, illegal-when-broke, illegal-when-not-your-turn.
   - Every character action (Tax, Assassinate, Steal, Exchange) — unchallenged success, challenged-and-proven, challenged-and-failed.
   - Every block (Duke blocks Foreign Aid, Contessa blocks Assassinate, Captain/Ambassador blocks Steal) — unchallenged success, challenged-and-proven, challenged-and-failed.
   - **Mandatory-Coup at 10 coins** — assert the action menu output excludes everything except Coup.
   - **Ambassador exchange privacy** — assert the returned 2 cards are validated as a subset of the 4-card pool; server rejects fabricated returns.
   - **Win condition** at each elimination boundary (6→5, 5→4, 4→3, 3→2 living players).
   - **Forfeit-on-disconnect** — 30s timer expiry flips both cards face-up, eliminates the player, advances the game.
   - **Challenge race tie-break** — two simultaneous challenges resolve by server timestamp; second is silently dropped.
   - **Assassinate coins paid even if blocked / challenged-and-lost** — coin ledger correct in all four outcomes.
8. **No bugs.** Re-read every block of generated code before presenting. "Probably works" is a failure mode in a real-time multiplayer game where bugs are visible to 5 other players at once.
9. **Tone:** formal, direct, technical. Solo development by an experienced engineer. They want answers, not warmth.

When you finish a non-trivial change, propose a smoke-test plan: which seat configurations to test, which action sequences exercise the change, and how to verify per-player view slicing if the change touched broadcast logic.

---

## 9. File Layout (Target)

```
coup-online/                            # github.com/T7SEN/coup-online
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── web/                          # Next.js 16 frontend (Vercel Hobby — free)
│   │   ├── app/
│   │   │   ├── auth/signin/         # Sign-in page (Google + Discord + email magic link via Better Auth client)
│   │   │   ├── (app)/
│   │   │   │   ├── play/            # Public matchmaking entry
│   │   │   │   ├── room/[code]/     # Private room join + game UI
│   │   │   │   ├── profile/         # User profile, match history
│   │   │   │   └── leaderboard/     # Public top-100 (TrueSkill conservative rating)
│   │   │   └── layout.tsx           # Cloudflare Web Analytics beacon in <head>
│   │   │   # /api/auth/* and /api/ws-token are NOT route handlers — next.config.ts rewrites them to the Worker
│   │   ├── components/
│   │   │   ├── game/                # Card, Hand, ActionBar, ChallengeButton, BlockButton, InfluenceLossPrompt, ExchangeSelector (GSAP-animated)
│   │   │   ├── lobby/               # ChatBox, PlayerList, RoomCodeShare
│   │   │   └── ui/                  # shadcn primitives
│   │   ├── lib/
│   │   │   ├── ws-client.ts         # Typed WebSocket client (uses packages/protocol)
│   │   │   ├── auth-client.ts       # Better Auth React client (createAuthClient + magicLinkClient)
│   │   │   └── get-server-session.ts # Server-component session helper (forwards cookie to Worker /api/auth/get-session)
│   │   ├── next.config.ts           # rewrites() /api/auth/:path* and /api/ws-token → Worker
│   │   └── package.json
│   └── game-server/                  # Cloudflare Worker + DOs (Workers Free plan)
│       ├── src/
│       │   ├── index.ts             # Worker entry, Hono router (mounts /api/auth/* + /api/ws-token + /api/ws)
│       │   ├── do-game-room.ts      # GameRoom Durable Object (SQLite-backed)
│       │   ├── do-matchmaking.ts    # MatchmakingQueue DO (SQLite-backed)
│       │   ├── do-room-codes.ts     # RoomCodeRegistry DO (SQLite-backed)
│       │   ├── auth.ts              # Better Auth factory (Drizzle adapter → D1) + WS-JWT verifier
│       │   ├── ws-token.ts          # HS256 5-min WS-JWT signer
│       │   └── db-helpers.ts        # Match-result persistence helper
│       ├── wrangler.toml            # Bindings: GameRoom, MatchmakingQueue, RoomCodeRegistry (all sqlite_classes), DB (d1_database)
│       └── package.json
└── packages/
    ├── protocol/                     # Shared Zod schemas + TS types
    │   └── src/
    │       ├── client-messages.ts   # Client → Server (action, challenge, block, chat, exchange-pick, influence-pick)
    │       ├── server-messages.ts   # Server → Client (state-update, error, game-end, chat, prompt)
    │       └── player-view.ts       # PlayerView type — the sliced state shape
    ├── game-logic/                   # Pure Coup rules — testable, framework-free
    │   ├── src/
    │   │   ├── deck.ts              # Shuffle (Fisher-Yates + Web Crypto), deal, draw
    │   │   ├── state-machine.ts     # Phase transitions
    │   │   ├── actions.ts           # Action validation + resolution
    │   │   ├── challenges.ts        # Challenge resolution
    │   │   ├── blocks.ts            # Block resolution
    │   │   ├── player-view.ts       # buildPlayerView slicing utility
    │   │   └── win-condition.ts     # Elimination + game-end check
    │   └── test/                    # Vitest — every rule has a test
    ├── rating/                       # TrueSkill MMR math (ts-trueskill wrapper)
    │   └── src/
    │       ├── index.ts             # rateMatch(seats: SeatResult[]): RatingDelta[]
    │       └── display.ts           # conservativeRating(mu, sigma) → number
    └── db/                           # Drizzle schema + D1 migrations + queries
        ├── src/
        │   ├── schema.ts            # users, accounts, verification_tokens, friends, friend_requests, matches, match_players, mmr_history
        │   └── queries.ts           # Reusable query builders (imported by the Worker only)
        └── drizzle/migrations/      # SQL migration files; applied via `wrangler d1 migrations apply`
```

---

## 10. Decision Heuristics

When in doubt:

1. Does this require offline support? → Refuse. Real-time game, architecture doesn't allow it (§ 3.7).
2. Does this expose a card identity beyond its owner? → Refuse, card-leak (§ 3.1).
3. Does this let the client decide a game-rule outcome? → Refuse, server-only.
4. Does this rely on `Math.random()` or non-deterministic state? → Refuse, use Web Crypto.
5. Is this a Coup variant or expansion? → Refuse, v1 base only (§ 1).
6. Is this co-op or team-based? → Refuse, Coup is PvP.
7. Does this skip Zod validation on a WebSocket message? → Refuse; add the schema first.
8. Does this break the state machine phase sequence? → Refuse; advance through phases server-side only (§ 3.2).
9. Will this cause hydration mismatch (Date.now, locale, browser-only API in render)? → Lazy `useState`, defer to effect, wrap browser globals.
10. Server-only secret? → Env var bound to the Worker / Next route, never shipped to client.
11. **Does this introduce a paid-tier dependency?** → Refuse without explicit pricing approval. v1 budget is zero.
12. **Does this access D1 from Next.js directly?** → Refuse; route through Worker HTTP endpoints. Worker owns D1.
13. **Does this use Postgres-specific SQL?** → Refuse; D1 is SQLite. Use portable equivalents.
14. **Does this add GitHub OAuth?** → Refuse; v1 providers are Google + Discord + email magic link only.
15. **Does this reach for Framer Motion / Vercel Analytics / Glicko-2 / Elo?** → Refuse; GSAP, Cloudflare Web Analytics, and TrueSkill are the choices.

---

## 11. Glossary

- **Action** — A move the current player makes on their turn. Seven types: Income, Foreign Aid, Coup, Tax, Assassinate, Steal, Exchange.
- **Block** — A counteraction declared by another player to negate an action. Block requires claiming a specific character.
- **Challenge** — A claim that another player does not hold the character they say they have. Resolved by reveal.
- **Influence** — A face-down character card. Each player starts with 2. Losing both eliminates the player.
- **Court Deck** — The face-down draw pile (`15 − 2N` cards at game start; varies with Exchange and proven-challenge returns).
- **TrueSkill** — Bayesian rating system (Microsoft Research, 2007) that natively handles N-player free-for-all matches. Each player has `mu` (skill estimate) and `sigma` (uncertainty). Conservative displayed rating: `mu − 3·sigma`.
- **mu / sigma** — TrueSkill rating parameters. mu starts at 25, sigma at 25/3. mu represents perceived skill; sigma represents the system's uncertainty about that estimate. Sigma decreases as the player completes more games.
- **DO** — Durable Object (Cloudflare Workers feature). One per game room + one each for matchmaking and room-code registry. **SQLite-backed only** (free-tier requirement).
- **D1** — Cloudflare's managed SQLite database. Free tier: 5 GB, 5M rows read/day, 100K writes/day. Worker-owned in this project.
- **PlayerView** — The per-recipient sliced game state. Always built via `buildPlayerView()`; never raw `GameState`.
- **Hibernation API** — Cloudflare Workers feature that lets a DO sleep without dropping its WebSocket connections. Compute drops to zero between messages.
- **Mandatory Coup** — Forced-Coup rule when a player starts their turn with ≥10 coins. Server-enforced.
- **Worker-owned D1** — Architectural rule: all D1 reads/writes happen inside `apps/game-server`. Next.js never holds a D1 binding; it proxies through Worker HTTP endpoints.

---

## 12. References

This skill is the entry point. Deeper, on-demand material lives in `references/*.md`.

| Task involves... | Reference file | Status |
|---|---|---|
| Detailed state-machine transitions, queue/pool semantics, error codes, v1 limitations | [`references/state-machine.md`](./references/state-machine.md) | ✓ exists |
| Expanded § 5 patterns with code examples, rationale, what-breaks-if-skipped | [`references/coding-patterns.md`](./references/coding-patterns.md) | ✓ exists |
| Expanded § 6 anti-hallucination inventory with rationale per substitution | [`references/anti-hallucination.md`](./references/anti-hallucination.md) | ✓ exists |
| Expanded § 7 refusal catalog with rationale and drop-in refusal phrasings | [`references/refusal-catalog.md`](./references/refusal-catalog.md) | ✓ exists |
| Code style — TS conventions, naming, imports, comments, tests, formatting, configs | [`references/code-style.md`](./references/code-style.md) | ✓ exists |
| Deployment — Vercel Hobby, Cloudflare Workers Free, D1, env vars, secrets, free-tier limits, monetization migration | [`references/deployment.md`](./references/deployment.md) | ✓ exists |
| D1 schema, Drizzle queries, migration conventions, Worker-owned access pattern | [`references/db-schema.md`](./references/db-schema.md) | ✓ exists |
| Cloudflare Workers/DO patterns, Hibernation API, Alarms, SQLite-backed migrations, GameRoom impl | [`references/durable-objects.md`](./references/durable-objects.md) | ✓ exists |
| Better Auth configuration on the Worker, JWT for WS handshake, Google + Discord + magic link providers, Next.js rewrites topology | [`references/auth.md`](./references/auth.md) | ✓ exists |
| GSAP animation patterns (Flip plugin, useGSAP hook, performance) | `references/animations.md` | planned |
| TrueSkill math, mu/sigma updates, N-player rating, leaderboard display formula | [`references/rating.md`](./references/rating.md) | ✓ exists |

Until a reference exists, this SKILL.md is the single source for that topic. Treat its sections as authoritative.