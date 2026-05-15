# AGENTS.md

Agent-facing working guide for `coup-online`. **SKILL.md is the canonical spec** — read it first.
This file is a thin overlay: where to start, what to run, what to avoid.

## Start here

1. Read `SKILL.md` end-to-end. It has the locked tech stack (§ 2), architectural pillars
   (§ 3), Coup rules of record (§ 4), auto-applied patterns (§ 5), the anti-hallucination
   inventory (§ 6), the refusal catalog (§ 7), and the target file layout (§ 9).
2. Skim `references/` for deep-topic guides loaded on demand (state machine, etc.).
3. Check `memory/MEMORY.md` for user-specific working rules (loaded automatically
   from `~/.claude/projects/.../memory/`).

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

## Workspace layout

| Path | What lives here |
|---|---|
| `apps/web/` | Next.js 16 frontend (Vercel Hobby) |
| `apps/game-server/` | Cloudflare Worker + 3 Durable Objects + D1 binding |
| `packages/protocol/` | Zod schemas for every WebSocket message + `PlayerView` type |
| `packages/game-logic/` | Pure Coup rules — actions, challenges, blocks, state machine, win condition |
| `packages/rating/` | TrueSkill wrapper (not yet implemented) |
| `packages/db/` | Drizzle schema + D1 migrations (not yet implemented) |
| `references/` | Deep-topic guides loaded on demand |

## High-frequency refusal triggers

These come up often enough to know cold (full list in SKILL.md § 7):

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
| A new Coup rule | `packages/game-logic/src/` | Pure functions, no I/O. Add Vitest coverage. |
| A new WS message type | `packages/protocol/src/` | Zod schema first; client and server both consume. |
| A new Worker route | `apps/game-server/src/` | Hono router in `index.ts`. |
| A new DO | `apps/game-server/src/do-*.ts` + `wrangler.toml` migration | Always `new_sqlite_classes`, never `new_classes`. |
| A new env binding | `wrangler.toml` then `pnpm cf-typegen` | Regenerates `worker-configuration.d.ts`. |
| A new tsconfig | Match the closest sibling (e.g., another package) | All workspaces are strict, ES2022, Bundler resolution. |
| A new ESLint config | Copy from any existing `eslint.config.mjs` | Must include `parserOptions.tsconfigRootDir: import.meta.dirname` (SKILL.md § 5). |
| A new convention or pattern | `SKILL.md` (cross-cutting) or `AGENTS.md` (agent-specific) or `references/*.md` (deep dive) | Don't leave it in chat history. |

## Plan before code

For any non-trivial change, state a plan first: file paths to touch and the
symbols to edit. Wait for user approval before writing code. SKILL.md § 8 step 2.

## Cite SKILL.md sections inline

When implementing rules, comment the spec section being enforced. Format:
`// per SKILL.md § 4.4 — Assassinate: coins paid even if blocked`.
