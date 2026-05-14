---
name: coup-online
description: Engineering guide for Coup Online — a 3–6 player real-time competitive social-deduction card game adapting Coup (Rikki Tahta, Indie Boards & Cards, 2012) to the web. LOAD for ANY task in this repo: features, fixes, game-rule implementation, action/challenge/block state machine, lobby + matchmaking, ELO/MMR, WebSocket protocol, Durable Objects, deployment, server actions, auth. Triggers: Coup, social deduction, bluffing card game, Duke, Assassin, Captain, Ambassador, Contessa, influence card, challenge, block, counteraction, Durable Object, DO Hibernation, matchmaking, ELO, MMR, 3-6 players, hidden information, server-authoritative, PlayerView, Coup Online. Stack: Next.js 16, React 19, Tailwind v4, shadcn/ui, Cloudflare Workers + Durable Objects, Hono, Neon Postgres + Drizzle, Auth.js v5, Zod, Framer Motion (motion), pnpm workspaces. Enforces patterns invisible to training: server-authoritative card state, per-recipient PlayerView slicing on every broadcast, Hibernation-API WebSockets, strict action-state-machine phase guards, mandatory-Coup at 10 coins, challenge-race tie-break by server timestamp, Web Crypto only (no Math.random, no node:crypto), Drizzle on Workers (no Prisma), Auth.js v5 (no next-auth v4 patterns), Tailwind v4 CSS-first (no tailwind.config.ts). Skipping produces card-leak vulnerabilities, illegal game states, replay-poisoned shuffles, broken challenge races, or matches that don't update ELO correctly.
---

# Coup Online — Pre-Flight Skill

Canonical agent guide for the Coup Online project — a faithful web adaptation of the Coup card game (Rikki Tahta, 2012) for 3–6 players, real-time, with persistent accounts, public matchmaking, ELO ranking, and spectator mode.

When this skill is loaded, run the pre-flight checklist below before any code or proposal. The game's mechanics dictate the architecture: server authority is non-negotiable, hidden information must be enforced per-player on every state broadcast, and the action lifecycle contains race conditions only the server can resolve. Most of what looks "obvious" in this stack is wrong (Socket.IO, Prisma, `Math.random`, `next-auth` v4 patterns) — read Section 6 before importing.

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
| Identity | Persistent accounts via Auth.js v5 (email magic link + Google + GitHub) |
| Reconnection | 30s grace, then auto-forfeit (both cards revealed, player eliminated) |
| Communication | Free text chat in lobby only. **No chat during active game.** |
| Eliminated players | Spectator with public info only (same view as living players) |
| Stats | Persistent: ELO/MMR, match history, leaderboards, win rate |
| Package manager | `pnpm` — never npm or yarn |
| Repository | TBD (to be assigned by maintainer) |
| Production URL | TBD (to be assigned by maintainer) |

**Banned features.** Never suggest, scaffold, or reference: co-op modes, AI bot opponents, custom or "house-rule" variants, expansion characters, in-game chat (lobby-only is the spec), voice chat, card trading or gifting, real-money currencies, microtransactions/lootboxes, or any mechanic that lets a player see another player's face-down cards before reveal. Each of these breaks either the game's design integrity, the v1 scope, or both.

---

## 2. Tech Stack (Locked Versions)

Pinned by `package.json` in each workspace. Do not upgrade as part of feature work.

### Frontend — `apps/web`

- **Runtime:** Next.js `^16` (App Router), React `^19`, TypeScript `^5`
- **Styling:** Tailwind CSS `^4` (CSS-first via `globals.css`, no `tailwind.config.*`), `tw-animate-css`, `tailwind-merge`
- **UI:** shadcn/ui (style: `radix-nova`, base: `zinc`, icons: `lucide`), `radix-ui`, `motion` (Framer Motion v12), `next-themes`
- **State / forms:** native React 19 (`useActionState`, `useTransition`), Zod, no Redux/Zustand for game state
- **Auth:** `next-auth` v5 / Auth.js (`@auth/core`, `@auth/drizzle-adapter`) — email magic link + Google + GitHub
- **WebSocket client:** native `WebSocket` API wrapped in a typed client backed by `packages/protocol`
- **Observability:** `@sentry/nextjs`, Vercel Analytics + Speed Insights

### Game Server — `apps/game-server`

- **Runtime:** Cloudflare Workers + Durable Objects, TypeScript `^5`
- **HTTP routing:** `hono` (runs natively on Workers)
- **WebSocket:** Workers WebSocket API + **Hibernation API** (DO sleeps between messages, connections persist, compute drops to zero)
- **Validation:** `zod` (shared schemas from `packages/protocol`)
- **Random / crypto:** Web Crypto only (`crypto.randomUUID()`, `crypto.getRandomValues()`). No `node:crypto`, no `Math.random()` for game logic.
- **Observability:** `@sentry/cloudflare`
- **Local dev:** `wrangler dev`

### Persistence — `packages/db`

- **Database:** Neon Postgres (serverless, edge-compatible)
- **ORM:** `drizzle-orm` + `drizzle-kit` migrations
- **Tables:** `users`, `accounts`, `sessions`, `verification_tokens` (Auth.js), `friends`, `matches`, `match_players`, `mmr_history`

### Shared packages

- **`packages/protocol`** — Zod schemas + TypeScript types for every WebSocket message (both directions). The contract between web client and game server. Imported by both `apps/`.
- **`packages/game-logic`** — Pure functions implementing Coup rules. No I/O, no framework dependencies. Vitest-tested. Shared between server and any future bot.
- **`packages/elo`** — Pure MMR math. Glicko-2 preferred; Elo with K-factor scaling acceptable as fallback.

**Anti-hallucination:** before writing any import, consult Section 6. Common drift: `socket.io`, `prisma`, `next-auth` v4 patterns, `tailwind.config.ts`, `pages/` directory, `node:crypto`, `redis` as primary state store, `express`. None of these belong here.

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
3. **`CHALLENGE_RESOLUTION`** — challenged player either reveals the claimed card (challenger loses an influence; claimant returns proven card to deck, shuffles, draws a replacement) or fails (claimant loses an influence; action is canceled, coins paid for Assassinate are still spent).
4. **`BLOCK_WINDOW`** — 15-second timer. Any player who can legally block claims the blocker character (Duke blocks Foreign Aid; Captain or Ambassador blocks Steal; Contessa blocks Assassinate). If no block declared, action resolves.
5. **`BLOCK_CHALLENGE_WINDOW`** — 15-second timer. Any player may challenge the block claim. Same resolution shape as CHALLENGE_RESOLUTION.
6. **`INFLUENCE_LOSS`** — per-player private prompt: "pick which card to lose." Only the losing player sees both their face-down cards on this prompt; everyone else sees only the resulting face-up card after they confirm. Timeout (15s) auto-picks a card.
7. **`EXCHANGE_SELECTION`** — Ambassador-only. Player sees their 2 cards plus 2 drawn from the Court Deck. They pick which 2 to keep; the other 2 return to the deck (re-shuffled server-side). Strictly private — server validates the returned 2 are a valid subset of the 4.
8. **`TURN_END`** — server checks elimination + win condition. Advances turn to next living player.

**Challenge race tie-break:** if two players send `challenge` messages within the same tick, the server's authoritative receive timestamp (`Date.now()` inside the DO) wins. Subsequent challenges in the same window are silently dropped — the client never learns it lost the race except by absence of effect.

**Mandatory-Coup at 10 coins:** if a player starts their turn with ≥10 coins, their only legal action is Coup. The action menu must hide all other options client-side. Server enforces independently — never trust the client.

### 3.3 Durable Object Per Room

Each match is one Durable Object instance. The DO:
- Holds the canonical `GameState` in DO storage (transactional, durable).
- Manages WebSocket connections via the **Hibernation API** — the DO sleeps between messages, compute drops to zero, connections persist via the runtime.
- Validates every inbound message against the protocol schema + the current state machine phase.
- Broadcasts per-player slices on every state mutation.
- On `TURN_END` if the game is over: writes `matches` + `match_players` + `mmr_history` to Postgres, updates each player's ELO, and shuts down (releases connections).

Match IDs are server-generated `crypto.randomUUID()`. Private room codes are short human-shareable codes (6 chars, base32 alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no ambiguous chars), mapped to DO IDs in a separate `RoomCodeRegistry` Durable Object.

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

### 3.6 ELO / MMR + Match Persistence

On game end, the server writes (in one transaction):
- One `matches` row (matchId, started_at, ended_at, winner_user_id).
- N `match_players` rows (matchId, userId, seat, final_mmr_before, final_mmr_after, outcome).
- N `mmr_history` deltas.

Use **Glicko-2** (preferred — handles low-volume players better) or Elo with K=32 for new accounts (<30 games) and K=16 thereafter. Persistence is **post-game only** — the DO state is the live source of truth during the match.

Match history is readable only by participants. Leaderboards are public top-100. No PII beyond display name and avatar.

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
- **Drizzle migrations are checked in.** Never edit a shipped migration; add a new one.
- **`'use server'` files export only async functions.** Constants live in `*-constants.ts`.
- **`cookies()` and `headers()` are async in Next.js 16** — `await` them.
- **`useSearchParams()` requires a `<Suspense>` boundary** at the page level (Next 16 prerender bailout).
- **Optimistic UI** is for client-side ack only (e.g., grey out the "Challenge" button after clicking). Never optimistic-render server-truth state. Wait for the broadcast.
- **Card animations** use Framer Motion `layout` + `layoutId` for cross-component morphing (deck → hand → revealed pile). Use `opacity` + `transform` only; **never animate `filter: blur()`** (mobile WebView repaint cost is catastrophic on lower-end devices).
- **Mobile-first layout.** Design and test at 360px wide first. Card fans collapse to a stack-with-select on narrow viewports.
- **`dir="auto"` on every user-typed text-bearing element** (chat input, display name, room name). Future-proofs i18n.
- **Sentry on both ends.** `@sentry/nextjs` in `apps/web`, `@sentry/cloudflare` in `apps/game-server`. Tag every event with `matchId` when in a game.
- **No `console.log` in committed code.** Use a `logger` utility that no-ops in production and routes to Sentry breadcrumbs in development.
- **MMR write is the last step of `endGame()`** — after all other match-result persistence succeeds. If MMR write fails, retry; do not roll back match data.
- **WebSocket auth** via signed JWT in the upgrade query string (`?token=...`), verified by the DO before accepting the connection. Cookies do not transfer cleanly from the Next.js domain to the Workers domain.

---

## 6. Anti-Hallucination Inventory

If a search result, training memory, or autocomplete suggests one of these — it is wrong for this codebase.

| What you might reach for | What this project uses instead |
|---|---|
| `socket.io`, `socket.io-client`, `engine.io` | Native WebSocket + DO Hibernation API. Socket.IO requires sticky sessions; DOs solve presence and per-room state natively. |
| `prisma`, `@prisma/client`, `schema.prisma` | Drizzle ORM. Edge-compatible, type-safe, faster on Workers. Prisma is not Workers-native. |
| `next-auth` v4 patterns (`[...nextauth].ts` in `pages/api`, `getServerSession`, `NextAuthOptions`) | Auth.js v5 — `auth()` helper, route handler in `app/api/auth/[...nextauth]/route.ts`, config in `auth.ts`, `getServerSession` does not exist. |
| `tailwind.config.ts`, `tailwind.config.js` | Tailwind v4 CSS-first. All config in `globals.css` via `@theme` directive. |
| `pages/` directory, `getServerSideProps`, `getStaticProps`, `getInitialProps` | App Router only. Server Components default. |
| `node:crypto`, `crypto` module from Node | Web Crypto: `crypto.randomUUID()`, `crypto.getRandomValues()`. Workers don't have `node:crypto`. |
| `Math.random()` for game logic | `crypto.getRandomValues()` seeding Fisher-Yates. Math.random is not crypto-secure and is replay-poisonous. |
| `redis`, `ioredis`, Upstash as primary state store | Durable Object storage is the live source of truth during a match. Postgres is post-game persistence. Redis is not in the stack. |
| `express`, `fastify` in the game server | Hono. Runs on Workers natively; Express and Fastify don't. |
| `mongoose`, MongoDB | Postgres + Drizzle. |
| Polling endpoints for matchmaking | WebSocket subscription to the `MatchmakingQueue` DO. Polling is wasteful and laggy. |
| Yjs, Automerge, or any CRDT for game state | Game state is server-authoritative, not collaborative. CRDTs would let clients propose state — exactly what we prevent. |
| `useEffect` for data fetching in Server Components | Server Components don't have effects. Fetch in the async component body. |
| `npm`, `yarn`, `yarn.lock`, `package-lock.json` | `pnpm` and `pnpm-lock.yaml`. Monorepo via pnpm workspaces. |
| `localStorage` for session token | HTTP-only cookies (Auth.js handles this on the web side). WebSocket auth is a signed JWT in the upgrade query string. |
| Class components, `componentDidMount`, `setState({...})` | Functional components + hooks only. |
| Storing card identities in Redux / Zustand / React state | Server is the truth. Client state is a *cache* of the latest `PlayerView` broadcast — opaque hidden tokens, never inferred identities. |
| WebRTC for game state or chat | Game state goes through the server. WebRTC was considered for voice chat, which is banned. |
| Custom WebSocket libraries (`ws`, `uwebsockets.js`) on the server | Workers WebSocket API + Hibernation. The `ws` package doesn't run on Workers. |
| Per-feature client-side action validation as the "real" check | Server enforces every rule. Client validation is UX-only. |
| Shared `GameState` broadcast to all clients | `PlayerView` per recipient. See § 3.1. |

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
| Skip or shorten the 15s challenge window below ~8s | Players need deliberation time; tension is core to the game |
| Allow chat during active game | Spec lock — chat is lobby-only |
| Add voice chat / WebRTC | Out of v1 scope; text-only |
| Use Socket.IO on the server | Doesn't run on Cloudflare Workers; DOs replace its room model |
| Use Prisma | Not edge-compatible; Drizzle is the choice |
| Use `next-auth` v4 patterns | We're on Auth.js v5; APIs differ significantly |
| Polling for matchmaking or game state | WebSocket subscription required; polling is wasteful and laggy |
| Client-authoritative action validation ("trust the client to enforce mandatory Coup at 10 coins") | Clients are adversarial; server enforces every rule |
| Real-money transactions, microtransactions, lootboxes | Out of scope; not in spec |
| Spectator can see all hands face-up | Spec lock — eliminated/spectators see public info only (§ 1) |
| "Cheat code" or debug endpoint that reveals opponents' cards | No client-side bypass ever ships; tests use the server directly |
| PWA / service worker / offline mode | § 3.7 — real-time game, online-required by design |
| Universal `Math.random` + comment "good enough for shuffle" | Refuse without exception |

---

## 8. Agent Operating Procedure

When this skill triggers:

1. **Run Section 0 pre-flight.** Refuse if banned or out of scope.
2. **State a plan before code** for any non-trivial change. Name the file paths you'll touch and the symbols you'll edit.
3. **Cite the rules section** when implementing game logic. Format: `// per SKILL.md § 4.4 — Assassin: coins paid even if blocked`.
4. **Apply Section 5 patterns** to every code change automatically. Re-check before submitting.
5. **Push back on bad ideas, including from the user.** Refuse with rationale; offer alternatives. Do not sugar-coat. Examples: user asks for `Math.random()` shuffle → refuse, explain replay determinism + crypto. User asks to relax server authority "for simplicity" → refuse, explain card-leak. User asks for co-op mode → refuse, explain Coup's design.
6. **Surface uncertainty.** If a request is ambiguous, ask one targeted question. Do not invent context.
7. **Test game logic in `packages/game-logic`.** Pure functions, Vitest, every rule has a test. CI runs them on every push.
8. **No bugs.** Re-read every block of generated code before presenting. "Probably works" is a failure mode in a real-time multiplayer game where bugs are visible to 5 other players at once.
9. **Tone:** formal, direct, technical. Solo development by an experienced engineer. They want answers, not warmth.

When you finish a non-trivial change, propose a smoke-test plan: which seat configurations to test, which action sequences exercise the change, and how to verify per-player view slicing if the change touched broadcast logic.

---

## 9. File Layout (Target)

```
coup-online/
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── web/                          # Next.js 16 frontend (Vercel)
│   │   ├── app/
│   │   │   ├── (auth)/login/        # Auth.js sign-in
│   │   │   ├── (app)/
│   │   │   │   ├── play/            # Public matchmaking entry
│   │   │   │   ├── room/[code]/     # Private room join + game UI
│   │   │   │   ├── profile/         # User profile, match history
│   │   │   │   └── leaderboard/     # Public top-100
│   │   │   ├── api/auth/[...nextauth]/route.ts
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── game/                # Card, Hand, ActionBar, ChallengeButton, BlockButton, InfluenceLossPrompt, ExchangeSelector
│   │   │   ├── lobby/               # ChatBox, PlayerList, RoomCodeShare
│   │   │   └── ui/                  # shadcn primitives
│   │   ├── lib/
│   │   │   ├── ws-client.ts         # Typed WebSocket client (uses packages/protocol)
│   │   │   └── auth.ts              # Auth.js config
│   │   └── package.json
│   └── game-server/                  # Cloudflare Worker + DOs
│       ├── src/
│       │   ├── index.ts             # Worker entry, Hono router
│       │   ├── do-game-room.ts      # GameRoom Durable Object
│       │   ├── do-matchmaking.ts    # MatchmakingQueue DO
│       │   ├── do-room-codes.ts     # RoomCodeRegistry DO
│       │   └── auth.ts              # JWT verification for WS handshake
│       ├── wrangler.toml
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
    ├── elo/                          # Glicko-2 + Elo MMR math
    └── db/                           # Drizzle schema + migrations + queries
        ├── src/schema.ts
        └── drizzle/migrations/
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

---

## 11. Glossary

- **Action** — A move the current player makes on their turn. Seven types: Income, Foreign Aid, Coup, Tax, Assassinate, Steal, Exchange.
- **Block** — A counteraction declared by another player to negate an action. Block requires claiming a specific character.
- **Challenge** — A claim that another player does not hold the character they say they have. Resolved by reveal.
- **Influence** — A face-down character card. Each player starts with 2. Losing both eliminates the player.
- **Court Deck** — The face-down draw pile (`15 − 2N` cards at game start; varies with Exchange and proven-challenge returns).
- **MMR** — Matchmaking Rating. Glicko-2 preferred, Elo with scaled K as fallback. Updated post-game.
- **DO** — Durable Object (Cloudflare Workers feature). One per game room + one each for matchmaking and room-code registry.
- **PlayerView** — The per-recipient sliced game state. Always built via `buildPlayerView()`; never raw `GameState`.
- **Hibernation API** — Cloudflare Workers feature that lets a DO sleep without dropping its WebSocket connections. Compute drops to zero between messages.
- **Mandatory Coup** — Forced-Coup rule when a player starts their turn with ≥10 coins. Server-enforced.

---

## 12. References (To Be Added)

This skill is the entry point. As the project grows, deeper material should move to `references/*.md` and be loaded on demand. Anticipated splits:

| Task involves... | Future reference file |
|---|---|
| Detailed state-machine transitions + edge cases (chained challenges, exchange + simultaneous influence-loss) | `references/state-machine.md` |
| Postgres schema, Drizzle queries, migration conventions | `references/db-schema.md` |
| Cloudflare Workers/DO patterns, Hibernation API, Alarms | `references/durable-objects.md` |
| Auth.js v5 configuration, JWT for WS handshake, OAuth providers | `references/auth.md` |
| Deployment (Vercel, Cloudflare, Neon), env vars, secrets | `references/deployment.md` |
| Card animation patterns (Framer Motion layoutId, performance) | `references/animations.md` |
| Glicko-2 / Elo math, K-factor scaling, leaderboard ZSETs | `references/mmr.md` |

Until these exist, this SKILL.md is the single source. Treat its sections as authoritative.
