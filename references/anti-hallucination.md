# Anti-Hallucination Inventory — Detailed

Companion to SKILL.md § 6. The SKILL.md table is the quick lookup; this file
explains **why** each substitution holds and what specifically to use instead.
Most of this stack post-dates training-data cutoffs or contradicts older
conventions — if autocomplete suggests an entry from the left column, stop and
re-read the right column before importing.

---

## WebSocket layer

### ❌ `socket.io`, `socket.io-client`, `engine.io`

Socket.IO requires sticky sessions and its own room-management protocol. Cloudflare
Workers are stateless edge runtimes; sticky sessions don't apply, and the Workers
WebSocket API + Durable Objects natively solve presence and per-room state.

**Use:** Native `WebSocket` API + **Hibernation API** in the Durable Object.
- Server side: `ctx.acceptWebSocket(ws)` (not `ws.accept()`) — the DO sleeps between
  messages while the WebSocket persists, compute drops to zero.
- Client side: native `WebSocket` constructor wrapped in a typed client backed by
  `packages/protocol` Zod schemas.

### ❌ `ws` (npm package), `uwebsockets.js`

Don't run on Cloudflare Workers — they're Node-targeted libraries with a different
event loop and module system. Workers WebSocket API is the only option.

---

## Database / ORM

### ❌ Prisma, `@prisma/client`, `schema.prisma`

Prisma's query engine is a Rust binary that doesn't run on Cloudflare Workers
(no native binaries, no `node:fs` for engine loading). Drizzle is pure TypeScript,
edge-compatible, type-safe.

**Use:** `drizzle-orm` + `drizzle-orm/d1` adapter + `drizzle-kit` migrations.

### ❌ `@neondatabase/serverless`, `postgres.js`, any Postgres database

Neon's free tier is 0.5 GB; D1's is 5 GB. Postgres also adds a separate billing
surface and cross-runtime driver pain (different connection pooling rules
between Workers and Next.js). Keeping the data plane inside Cloudflare collapses
the operational surface.

**Use:** Cloudflare D1 (SQLite) via the Worker's `DB` binding.

### ❌ Postgres-specific SQL: JSONB, native arrays, `RETURNING *` with complex types, materialized views, partial indexes with function predicates, `tsvector`, range types

D1 is SQLite. Most Postgres features don't exist; some have rough equivalents.

**Use:**
- JSONB → `TEXT` column + `json_extract` / `json_each`
- Arrays → join table or JSON
- Materialized views → application-level caching
- `tsvector` → SQLite's built-in FTS5 extension
- Partial indexes with function predicates → simple `WHERE` indexes

### ❌ Direct D1 access from Next.js / Vercel

`drizzle-orm/d1` requires a `D1Database` binding, which only exists in the Workers
runtime. Trying to use the D1 REST API from Next.js bypasses our authorization
boundary and adds a second billing surface.

**Use:** Worker owns D1 exclusively. Better Auth runs on the Worker too, with
the Drizzle adapter pointed straight at the D1 binding. Next.js proxies
`/api/auth/*` to the Worker via `next.config.ts` `rewrites()` — cookies stay
on the Vercel origin while the database surface lives entirely on Cloudflare.

### ❌ `mongoose`, MongoDB

Different paradigm; not in the stack.

**Use:** D1 + Drizzle.

---

## Auth

### ❌ `next-auth` / Auth.js at any version — `[...nextauth].ts`, `@auth/core`, `@auth/drizzle-adapter`, `getServerSession`, `NextAuthOptions`, `useSession from "next-auth/react"`

Auth.js (formerly next-auth) was previously used in this project and has been
removed. The project is on **Better Auth** (`better-auth`) running on the
Worker. Any Auth.js import, helper, or schema convention is wrong for this
codebase — the column names, session model, route handler, and adapter
contract all differ.

**Use:** Better Auth conventions:
- Factory in `apps/game-server/src/auth.ts` — `betterAuth({ database: drizzleAdapter(db, { provider: 'sqlite', schema: { user, session, account, verification } }) })`
- Router mount in `apps/game-server/src/index.ts` — `app.on(['GET','POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw))`
- Browser client at `apps/web/lib/auth-client.ts` — `createAuthClient({ plugins: [magicLinkClient()] })` from `better-auth/react`
- Server-side session via `apps/web/lib/get-server-session.ts` (forwards cookie header)
- Next.js never has a D1 binding; `next.config.ts` `rewrites()` proxies `/api/auth/*` and `/api/ws-token` to the Worker
- Skills: `better-auth-best-practices`, `better-auth-security-best-practices`, `email-and-password-best-practices`
- Reference: [`auth.md`](./auth.md)

### ❌ GitHub OAuth provider

v1 providers are locked: Google + Discord + email magic link (via
`better-auth/plugins/magic-link` + Resend). Adding GitHub requires explicit
spec amendment in SKILL.md § 1.

---

## Tailwind

### ❌ `tailwind.config.ts`, `tailwind.config.js`

Tailwind v4 is CSS-first. Config lives in CSS via the `@theme` directive.

**Use:** `apps/web/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  /* Project design tokens defined here. */
  /* e.g., --color-card-back: oklch(...); */
}
```

### ❌ Tailwind v3 `@tailwind base; @tailwind components; @tailwind utilities;` directives

That's the v3 syntax. v4 uses a single `@import "tailwindcss";`.

---

## Next.js patterns

### ❌ `pages/` directory, `getServerSideProps`, `getStaticProps`, `getInitialProps`

App Router only. Server Components are the default.

**Use:**
- Routes in `app/`
- Data fetching in async Server Component bodies
- Mutations via Server Actions (`'use server'`)
- Route Handlers in `app/api/.../route.ts`

### ❌ Class components, `componentDidMount`, `setState({...})`

Functional components + hooks only.

### ❌ `useEffect` for data fetching in Server Components

Server Components don't have effects. Fetch in the async component body directly.

### ❌ Synchronous `cookies()` / `headers()` in Next.js 16

Next 16 made these async. Sync access throws.

**Use:**
```ts
import { cookies, headers } from 'next/headers'
const cookieStore = await cookies()
const headerList = await headers()
```

---

## Crypto / randomness

### ❌ `node:crypto`, `crypto` module from Node

Cloudflare Workers don't expose `node:crypto`. Even if the worker has `nodejs_compat` set, we don't use it (SKILL.md § 5).

**Use:** Web Crypto — global `crypto.randomUUID()` and `crypto.getRandomValues()`.

### ❌ `Math.random()` for game logic, shuffles, room codes, IDs

Not crypto-secure. `Math.random` is seeded by browser/runtime and is predictable
enough that a determined player could replay or pre-compute draws.

**Use:** `crypto.getRandomValues()` seeding Fisher-Yates. Project-wide helper
`randomIntBelow(maxExclusive)` in `packages/game-logic/src/deck.ts` uses
rejection sampling to avoid modulo bias.

---

## State stores

### ❌ `redis`, `ioredis`, Upstash as primary state store

Adds a separate billing surface and a roundtrip per state access. The Durable
Object's SQLite storage is already transactional, durable, and local to the
match's compute.

**Use:** DO SQLite storage during a live match. D1 for post-game persistence
(matches table, leaderboards, MMR history).

### ❌ Yjs, Automerge, or any CRDT for game state

CRDTs are for collaborative editing where conflicting concurrent edits must
merge. Coup is server-authoritative — clients propose, server decides. Letting
clients propose conflicting state is exactly what we prevent.

### ❌ Storing card identities in Redux / Zustand / React state

Server is the truth. Client state is a **cache** of the latest `PlayerView`
broadcast — opaque `{ status: 'hidden' }` tokens, never inferred identities.

---

## HTTP server

### ❌ `express`, `fastify` in the game server

Don't run on Cloudflare Workers without bundler hacks.

**Use:** Hono — Workers-native, similar Express-style routing.

---

## Animation

### ❌ `motion`, `motion/react`, `framer-motion`

Framer Motion was renamed to `motion`. Either way: not in this stack. Two reasons:
- License: Framer Motion has a commercial-use restriction we'd need to track.
- Power: GSAP's `Flip` plugin handles the cross-component morph (deck → hand →
  revealed pile) that this game's UX depends on. Framer Motion has no equivalent.

**Use:** GSAP via `gsap` core + `@gsap/react`'s `useGSAP` hook (React lifecycle
correctness) + `Flip` plugin (cross-component morph). GSAP became 100% free
under Webflow's stewardship in April 2025; all formerly-paid Club plugins are
unrestricted.

---

## Analytics

### ❌ `@vercel/analytics`, `@vercel/speed-insights`

Vercel Analytics caps at 2.5K events/month on Hobby. Not enough for a
real-time multiplayer game.

**Use:** Cloudflare Web Analytics — beacon script in `<head>` of root layout.
Free, no event cap, no NPM package needed.

---

## Rating

### ❌ Glicko-2, Elo, K-factor scaling, pairwise rating updates

Elo is 1v1-only by design. Glicko-2 decomposes N-player matches to pairwise
comparisons, which double-counts and produces drift. Decomposing 3-6-player
free-for-all to pairwise is exactly the wrong shape.

**Use:** TrueSkill via `ts-trueskill`. N-player free-for-all is TrueSkill's
**native** case. Pass an ordered array of single-player teams to `rate()`.

Defaults: mu = 25, sigma = 25/3, beta = 25/6, tau = 25/300, draw probability = 0
(Coup has a winner). Display via `mu − 3·sigma` (conservative estimate).

---

## Durable Objects

### ❌ Key-value-backed DOs (`new_classes` in wrangler migrations)

Key-value-backed DOs are paid-plan only. Using them puts the project off the
free tier.

**Use:** SQLite-backed DOs only — `new_sqlite_classes` in `wrangler.toml`:

```toml
[[migrations]]
tag = "v1"
new_sqlite_classes = ["GameRoom", "MatchmakingQueue", "RoomCodeRegistry"]
```

---

## Networking patterns

### ❌ Polling endpoints for matchmaking or game state

Wasteful, laggy. The infrastructure for push exists.

**Use:** WebSocket subscription to the `MatchmakingQueue` DO. The DO pushes a
`state-update` (or queue-update) when something changes.

---

## Server validation

### ❌ Per-feature client-side action validation as the "real" check

Clients are adversarial. UX validation is fine for instant feedback, but the
server must independently enforce every rule.

**Use:** Server enforces every rule. Client validation is UX-only. SKILL.md § 5 —
phase guards as the first check in every action handler.

### ❌ Shared `GameState` broadcast to all clients

Card-leak vulnerability. Any client can inspect their browser network tab.

**Use:** `buildPlayerView(state, playerId)` per recipient. SKILL.md § 3.1.

---

## Package manager

### ❌ `npm`, `yarn`, `package-lock.json`, `yarn.lock`

We use pnpm. The monorepo is configured for pnpm workspaces; `npm install` won't
respect the workspace protocol the same way.

**Use:** `pnpm` and `pnpm-lock.yaml`. Specifically `pnpm@11.1.2` per the root
`package.json::packageManager`.

---

## Session / token storage

### ❌ `localStorage` for session token

Vulnerable to XSS exfiltration.

**Use:**
- Next.js session: HTTP-only cookie set by Better Auth (issued by the Worker;
  the browser sees it on the Vercel origin via `next.config.ts` rewrites).
- WebSocket auth: short-lived JWT in the upgrade query string, in memory only,
  fetched from the Worker's `POST /api/ws-token` (which Next.js rewrites
  transparently proxy from the browser).

---

## WebRTC / voice

### ❌ WebRTC for game state or chat

Game state goes through the server (server-authoritative). WebRTC was considered
for voice chat, which is banned in v1.

---

## Paid services

### ❌ Vercel Pro, Workers Paid, Neon Pro, Sentry Team, Postmark paid, Plausible

v1 is free-tier only. Introducing paid services requires explicit pricing
discussion and approval — see SKILL.md § 0 step 9.

**Use:**
- Vercel Hobby (free) for web
- Cloudflare Workers Free for game-server
- Cloudflare D1 (free 5 GB)
- Sentry Free (5K errors/month, shared between web + worker)
- Cloudflare Web Analytics (free, no cap)
- Resend Free tier (100 emails/day, 3K/month — verify current limits at resend.com/pricing before launch) for the magic-link provider

---

## Quick-reference checklist before adding a dependency

Before `pnpm add <thing>`, ask:

1. **Does it run on Cloudflare Workers?** No `node:*` imports, no native binaries.
2. **Is it on a permanent free tier?** Trials or credits don't count.
3. **Does it conflict with SKILL.md § 2's locked stack?** If so, justify or refuse.
4. **Is there a Workers-native alternative I missed?** Check this file's table first.
5. **Does it pull in a paid-by-default sub-dependency?** Some auth providers, observability tools, and analytics packages have free tiers that silently expire after N events.

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 6 (Anti-Hallucination Inventory) — the quick-lookup table this file expands
- **How to refuse a request that asks for one of these:** [`refusal-catalog.md`](./refusal-catalog.md) — user-facing rationale + refusal templates
- **The right pattern to reach for instead:** [`coding-patterns.md`](./coding-patterns.md) — code examples of the correct alternatives
- **Locked stack versions:** [`SKILL.md`](../SKILL.md) § 2 (Tech Stack — Locked Versions)
- **Deployment implications of free-tier-only choices:** [`deployment.md`](./deployment.md) — the monetization migration plan covers when the choices stop being free-only
