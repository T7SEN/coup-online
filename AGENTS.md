# AGENTS.md

Agent-facing working guide for `coup-online`. **SKILL.md is the canonical spec** — read it first.
This file is a thin overlay: where to start, what to run, what to avoid, where to look when you need depth.

## Start here

Read in this order:

1. **`SKILL.md`** end-to-end — the canonical spec. Sections:
   - § 0 — pre-flight checklist (run every request)
   - § 1 — product context, banned features
   - § 2 — locked tech stack versions
   - § 3 — architectural pillars (server authority, state machine, DOs, matchmaking, reconnection, TrueSkill, no-PWA)
   - § 4 — Coup rules of record (deck, actions, blocks, challenges, win condition)
   - § 5 — auto-applied patterns
   - § 6 — anti-hallucination inventory
   - § 7 — refusal catalog
   - § 8 — agent operating procedure
   - § 9 — target file layout
   - § 12 — index of `references/`
2. **`references/*.md`** — load on demand based on the task:
   - [`state-machine.md`](./references/state-machine.md) — per-action lifecycle, queue/pool semantics, full error-code table, v1 limitations. Read when implementing or modifying game-logic.
   - [`coding-patterns.md`](./references/coding-patterns.md) — every SKILL.md § 5 pattern with code examples and "what breaks if you skip it". Read when implementing anything that touches one of those patterns (Zod boundary, phase guards, GSAP, WS auth, rate limiting, hydration safety).
   - [`anti-hallucination.md`](./references/anti-hallucination.md) — the SKILL.md § 6 table expanded with rationale for each substitution. Read when reaching for a dep ("can I use X?").
   - [`refusal-catalog.md`](./references/refusal-catalog.md) — typical request phrasings + drop-in refusal templates. Read when about to refuse something.
   - [`code-style.md`](./references/code-style.md) — TypeScript conventions, naming, imports, comments, tests, error handling, formatting, configs. Read when writing code in an unfamiliar area.
   - [`deployment.md`](./references/deployment.md) — Vercel + Cloudflare deploy workflow, env vars, secrets, free-tier limits, monetization migration. Read when touching deploy config or secrets.
3. **`memory/MEMORY.md`** — user-specific working rules (loaded automatically from `~/.claude/projects/.../memory/`). Currently contains the documentation-discipline rule and the three-gate verification rule.

## Mandatory verification on every code change

Three gates from repo root, no exceptions for source-code touches:

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r build
```

Docs-only changes (`SKILL.md`, `AGENTS.md`, `references/*.md`, READMEs, plan files) skip
the gates. Anything else runs all three. See SKILL.md § 5 for the full rule.

For `packages/game-logic` specifically, also run:

```bash
pnpm --filter @coup-online/game-logic test
```

This is **not** in the three-gate sweep (which is tsc + lint + build only); it's a
fourth check specific to the pure-logic package's Vitest suite.

## Common commands

```bash
# First-time install
CI=1 pnpm install --no-frozen-lockfile

# Boot the web frontend
pnpm --filter @coup-online/web dev

# Boot the Worker locally (workerd)
pnpm --filter @coup-online/game-server dev

# Regenerate Worker types after wrangler.toml changes
pnpm --filter @coup-online/game-server cf-typegen
```

Note: `pnpm install` in pnpm 11 requires `CI=1` for non-interactive runs and
`--no-frozen-lockfile` when adding new deps. Subsequent installs without dep
changes don't need either flag.

For the full deploy / secrets / env-var workflow, see [`references/deployment.md`](./references/deployment.md).

## Workspace layout

| Path | What lives here | Deep reference |
|---|---|---|
| `apps/web/` | Next.js 16 frontend (Vercel Hobby) — lobby page + `room/[matchId]` with WS-driven game UI; typed WS client in `lib/ws-client.ts` | — |
| `apps/game-server/` | Cloudflare Worker + Hono router (`/health`, `/api/dev-token`, `/api/ws`) + GameRoom DO (full impl) + MatchmakingQueue / RoomCodeRegistry stubs + D1 binding | [`durable-objects.md`](./references/durable-objects.md), [`state-machine.md`](./references/state-machine.md) |
| `packages/protocol/` | Zod schemas for every WebSocket message + `PlayerView` type | [`state-machine.md`](./references/state-machine.md) for the contract |
| `packages/game-logic/` | Pure Coup rules — actions, challenges, blocks, state machine, win condition | [`state-machine.md`](./references/state-machine.md), [`coding-patterns.md`](./references/coding-patterns.md) |
| `packages/rating/` | TrueSkill wrapper for N-player free-for-all rating + leaderboard display | [`rating.md`](./references/rating.md) |
| `packages/db/` | Drizzle schema (8 tables: Auth.js + match + social) + D1 migrations + reusable queries | [`db-schema.md`](./references/db-schema.md) |
| `references/` | Deep-topic guides loaded on demand | this file |

## When you need to...

| Task | Read |
|---|---|
| Add or modify a game rule | SKILL.md § 4, [`state-machine.md`](./references/state-machine.md), [`coding-patterns.md`](./references/coding-patterns.md) § 1-5 |
| Add a WebSocket message | SKILL.md § 5, [`coding-patterns.md`](./references/coding-patterns.md) § 2, `packages/protocol/src/` |
| Implement / change broadcast slicing | SKILL.md § 3.1, [`coding-patterns.md`](./references/coding-patterns.md) § 1, `packages/game-logic/src/player-view.ts` |
| Wire WebSocket auth | SKILL.md § 5, [`coding-patterns.md`](./references/coding-patterns.md) § 17-19, [`deployment.md`](./references/deployment.md) secrets section |
| Add a new dependency | [`anti-hallucination.md`](./references/anti-hallucination.md) checklist at the bottom; SKILL.md § 2 |
| Refuse a request | [`refusal-catalog.md`](./references/refusal-catalog.md), SKILL.md § 7 |
| Write a new file | [`code-style.md`](./references/code-style.md), nearest sibling file as a template |
| Set up a new workspace | [`code-style.md`](./references/code-style.md) (configs section), [`coding-patterns.md`](./references/coding-patterns.md) § 23 (eslint) |
| Deploy / set secrets | [`deployment.md`](./references/deployment.md) |
| Implement a DO | SKILL.md § 3.3, `apps/game-server/src/do-*.ts` stubs as templates |

## High-frequency refusal triggers

Know these cold. Full catalog with phrasings in [`references/refusal-catalog.md`](./references/refusal-catalog.md):

- `Math.random` for any game-affecting randomness → Web Crypto only
- Broadcasting raw `GameState` to clients → always slice via `buildPlayerView(state, viewerId)`
- Skipping the phase guard on an action handler → first check in every handler
- Adding Coup expansion characters → v1 is base 5 only (Duke, Assassin, Captain, Ambassador, Contessa)
- Adding GitHub OAuth → v1 providers are Google + Discord + email magic link
- Postgres / Neon / Prisma → D1 (SQLite) + Drizzle
- Framer Motion / `motion` → GSAP via `@gsap/react` + Flip plugin
- Vercel Analytics → Cloudflare Web Analytics
- Glicko-2 / Elo → TrueSkill (`ts-trueskill`)
- Key-value DOs (`new_classes`) → SQLite-backed only (`new_sqlite_classes`)
- Direct D1 access from Next.js → Worker proxies via HTTP endpoints
- Paid-tier services → free tier only in v1

## Where new things go

| Adding... | Location | Notes |
|---|---|---|
| A new Coup rule | `packages/game-logic/src/` | Pure functions, no I/O. Add Vitest coverage. See [`coding-patterns.md`](./references/coding-patterns.md) for the patterns to follow. |
| A new WS message type | `packages/protocol/src/` | Zod schema first; client and server both consume. |
| A new Worker route | `apps/game-server/src/` | Hono router in `index.ts`. |
| A new DO | `apps/game-server/src/do-*.ts` + `wrangler.toml` migration | Always `new_sqlite_classes`, never `new_classes` (paid-plan). |
| A new env binding | `wrangler.toml` then `pnpm cf-typegen` | Regenerates `worker-configuration.d.ts`. |
| A new tsconfig | Match the closest sibling (e.g., another package) | All workspaces are strict, ES2022, Bundler resolution. See [`code-style.md`](./references/code-style.md). |
| A new ESLint config | Copy from any existing `eslint.config.mjs` | Must include `parserOptions.tsconfigRootDir: import.meta.dirname` (SKILL.md § 5). |
| A new convention or pattern | `SKILL.md` (cross-cutting) or `AGENTS.md` (agent-specific) or `references/*.md` (deep dive) | Don't leave it in chat history. Per the documentation-discipline memory rule. |
| A new env var / secret | [`deployment.md`](./references/deployment.md) secrets table | Document where it's set (Worker secret vs Vercel env vs both). |

## Plan before code

For any non-trivial change, state a plan first: file paths to touch and the
symbols to edit. Wait for user approval before writing code. SKILL.md § 8 step 2.

## Cite SKILL.md sections inline

When implementing rules, comment the spec section being enforced. Format:
`// per SKILL.md § 4.4 — Assassinate: coins paid even if blocked`.

## Doc-coherence rules

When updating documentation:

- A **fact** lives in **exactly one** authoritative place. Other docs link to it.
- SKILL.md is canonical and terse. References expand.
- If something needs to change in two places at once, you've duplicated; consolidate.
- New decisions go in the right doc (see SKILL.md § 5 "Document in the right place").
- Cross-link siblings — the bottom of each reference has a "See also" pointing to related references and the SKILL.md section it expands.
