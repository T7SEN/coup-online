# Coding Patterns — Detailed

Companion to SKILL.md § 5. The SKILL.md bullets are the quick reference; this
file shows what each pattern looks like in this codebase, why it exists, and
what breaks if you skip it.

---

## 1. Per-recipient state slicing — `buildPlayerView(state, viewerId)`

**Spec:** SKILL.md § 3.1, § 5.

**What it does.** Translates the canonical server-side `GameState` into a
`PlayerView` that obeys the hidden-information invariant — the recipient sees
their own face-down cards, other players' face-down cards become opaque
`{ status: 'hidden' }`, all revealed (lost) cards are public, the court deck
collapses to `{ count }`.

**Where it lives.** `packages/game-logic/src/player-view.ts`.

**Pattern:**

```ts
// Inside a DO broadcast routine:
for (const conn of liveConnections) {
  const view = buildPlayerView(state, conn.playerId)
  await conn.send({ type: 'state-update', view })
}
```

**What breaks if you skip it.** Card-leak vulnerability. Any client opening their
browser network tab sees the full deck plus other players' hands. Coup's whole
gameplay loop depends on hidden information — broadcasting raw `GameState` once
breaks the game permanently for that match.

**Refusal trigger:** any PR that calls `JSON.stringify(state)` for transmission,
or that constructs a view object inline instead of routing through this function.

---

## 2. Zod validation at every WebSocket boundary

**Spec:** SKILL.md § 5.

**What it does.** Validates inbound and outbound WS messages against the schemas
in `packages/protocol`. Clients can send arbitrary bytes; the DO must never
trust the shape.

**Pattern (inbound):**

```ts
import { ClientMessage } from '@coup-online/protocol'

ws.addEventListener('message', (event) => {
  const parsed = ClientMessage.safeParse(JSON.parse(event.data))
  if (!parsed.success) {
    // Reject; do not act on the message.
    ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Schema validation failed' }))
    return
  }
  dispatchClientMessage(parsed.data)
})
```

**Pattern (outbound):**

```ts
import { ServerMessage } from '@coup-online/protocol'

function send(ws: WebSocket, msg: ServerMessage) {
  // Even outbound — parse-on-send catches programmer errors where a handler
  // accidentally constructs an invalid PlayerView etc.
  const valid = ServerMessage.parse(msg)
  ws.send(JSON.stringify(valid))
}
```

**What breaks if you skip it.** A malformed `action` message could let a player
trigger an unhandled exception in the DO. A bad `state-update` could break
client rendering across all clients in a match.

---

## 3. Phase guards as the first check in every action handler

**Spec:** SKILL.md § 5, § 3.2.

**What it does.** Each action handler's first line refuses to do anything if
the phase is wrong. Prevents state-machine illegal transitions.

**Pattern (from `packages/game-logic/src/actions.ts`):**

```ts
export function applyTax(state: GameState, actorPlayerId: PlayerId): GameState {
  requirePhase(state, 'AWAITING_ACTION')  // ← first line, always
  const actor = getActor(state, actorPlayerId)
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  requireNotForcedToCoup(actor)
  // ... mutate state
}
```

**Helper:**

```ts
export function requirePhase(state: GameState, expected: Phase): void {
  if (state.phase !== expected) {
    throw new IllegalActionError('wrong_phase', `Expected phase ${expected}, got ${state.phase}`)
  }
}
```

**What breaks if you skip it.** An action declared during `CHALLENGE_WINDOW`
(another player's pending claim) would silently apply, mid-window, corrupting
the state machine. Race conditions in DO message handling become real bugs
instead of being filtered at the boundary.

---

## 4. Action-timer pauses only on the acting player's disconnect

**Spec:** SKILL.md § 3.5, § 5.

**What it does.** When a player disconnects, only their **own** action timer
pauses; others' timers continue. Prevents a disconnecting player from
hostage-blocking the match's progress.

**Pattern (DO-level — pseudocode for the alarm scheduler):**

```ts
async handleDisconnect(playerId: PlayerId) {
  this.markDisconnected(playerId)
  const state = await this.loadState()
  if (state.phase === 'AWAITING_ACTION' && state.seats[state.turnIndex].playerId === playerId) {
    this.pauseActionTimer()
  }
  // CHALLENGE_WINDOW, BLOCK_WINDOW, etc. — keep their timers running.
}
```

---

## 5. Web Crypto for all randomness — `crypto.getRandomValues()` + `crypto.randomUUID()`

**Spec:** SKILL.md § 5.

**What it does.** Every game-affecting random draw — Fisher-Yates shuffles,
first-turn selection, room codes, match/player IDs — uses Web Crypto. Never
`Math.random`.

**Where it lives:** `packages/game-logic/src/deck.ts`:

```ts
const webCrypto = (
  globalThis as unknown as {
    crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T }
  }
).crypto

export function randomIntBelow(maxExclusive: number): number {
  if (maxExclusive === 1) return 0
  const bits = 32 - Math.clz32(maxExclusive - 1)
  const mask = (1 << bits) - 1
  const buf = new Uint32Array(1)
  for (;;) {
    webCrypto.getRandomValues(buf)
    const r = buf[0] & mask
    if (r < maxExclusive) return r
  }
}
```

Rejection sampling avoids modulo bias. For a 15-card shuffle the bias is
negligible, but `randomIntBelow` is also used for room-code generation where
bias matters more for entropy.

**Why `globalThis` cast.** `crypto` is a global in both Cloudflare Workers and
Node 20+ (Vitest), but TypeScript's lib doesn't know about it without DOM/
WebWorker lib. The cast (per SKILL.md § 5) avoids pulling in DOM types that
would let game-logic accidentally reference `document` etc.

---

## 6. Drizzle migrations are checked-in and immutable once shipped

**Spec:** SKILL.md § 5.

**What it does.** Once a migration file is merged to main, it's frozen. New
schema changes go in new migration files.

**Pattern:** generate with `drizzle-kit generate` → commit the file → apply
to D1 via `wrangler d1 migrations apply <db-name> --remote` (or `--local` for
dev). Migrations live under `packages/db/drizzle/migrations/`.

**What breaks if you skip it.** Editing a shipped migration causes hash
mismatches in deployed databases; the migration log thinks the migration is
applied, but the current schema doesn't reflect the edit. State drift between
local dev and production.

---

## 7. `'use server'` files export only async functions

**Spec:** SKILL.md § 5.

**What it does.** Next.js Server Actions require the file's exports all be
async functions. Constants live in `*-constants.ts`.

**Pattern:**

```ts
// app/actions/match.ts
'use server'

import { MATCH_TIMEOUT_MS } from './match-constants'

export async function createMatch(input: CreateMatchInput) { /* ... */ }
export async function joinMatch(input: JoinMatchInput) { /* ... */ }
```

```ts
// app/actions/match-constants.ts
export const MATCH_TIMEOUT_MS = 30_000
```

---

## 8. `await cookies()` and `await headers()` in Next.js 16

**Spec:** SKILL.md § 5.

Next 16 made these async. Synchronous access throws at runtime.

**Pattern:**

```ts
import { cookies, headers } from 'next/headers'

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  return session
}
```

---

## 9. `useSearchParams()` requires a page-level `<Suspense>`

**Spec:** SKILL.md § 5.

Next 16 prerender bailout: any client component reading search params must be
wrapped in `<Suspense>` at the page level, or the build will fail.

**Pattern:**

```tsx
// app/room/[code]/page.tsx
import { Suspense } from 'react'
import { RoomClient } from './room-client'

export default function RoomPage() {
  return (
    <Suspense fallback={<div>Loading room…</div>}>
      <RoomClient />
    </Suspense>
  )
}
```

---

## 10. Optimistic UI for client-side ack only

**Spec:** SKILL.md § 5.

Optimistic = greying the "Challenge" button immediately after click so the user
sees their action registered. **Not** optimistic = displaying the action's
outcome before the server's `state-update` arrives.

**Pattern (allowed):**

```tsx
const [submitting, setSubmitting] = useState(false)

async function onChallenge() {
  setSubmitting(true)
  wsClient.send({ type: 'challenge' })
  // Re-enable when state-update arrives or on timeout.
}
```

**Pattern (forbidden):**

```tsx
// DO NOT do this.
function onChallenge() {
  setLocalState({ ...localState, phase: 'CHALLENGE_RESOLUTION' })  // ← fake the server
  wsClient.send({ type: 'challenge' })
}
```

The latter desyncs from the server-authoritative truth and shows the wrong
state to the user if their challenge wasn't first (challenge race tie-break).

---

## 11. GSAP animations via `useGSAP` + `Flip`

**Spec:** SKILL.md § 5.

**What it does.** All card / token / coin animations use GSAP. `useGSAP`
handles React lifecycle correctly (cleanup on unmount). `Flip` plugin handles
cross-component morphing — e.g., card flying from deck to hand, or hand to
revealed pile.

**Pattern:**

```tsx
import { useGSAP } from '@gsap/react'
import { Flip } from 'gsap/Flip'
import gsap from 'gsap'

gsap.registerPlugin(useGSAP, Flip)

function CardComponent({ cardId, state }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (state === 'flying') {
      const flipState = Flip.getState(`.card-${cardId}`)
      // ... morph
      Flip.from(flipState, { duration: 0.4, ease: 'power2.inOut' })
    }
  }, { dependencies: [state], scope: ref })

  return <div ref={ref} className={`card card-${cardId}`}>{/* ... */}</div>
}
```

**Animation rules:**
- Animate `opacity` and `transform` only.
- **Never** animate `filter: blur()` — catastrophic repaint cost on mobile WebViews.
- Scope selectors via `useGSAP`'s `scope` option to avoid global collisions.

---

## 12. Mobile-first at 360px

**Spec:** SKILL.md § 5.

Layout designed at 360px wide first, then scales up. Card fans collapse to
stack-with-select on narrow viewports.

**Pattern (Tailwind):**

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
  {/* Stack vertically on mobile; row on >=640px */}
</div>
```

---

## 13. `dir="auto"` on every user-typed text element

**Spec:** SKILL.md § 5.

Future-proofs i18n by letting the browser detect RTL/LTR per input.

**Pattern:**

```tsx
<input type="text" dir="auto" placeholder="Display name" />
<textarea dir="auto" placeholder="Type a message…" />
<span dir="auto">{player.displayName}</span>
```

---

## 14. Sentry on both runtimes; tag `matchId` when in a game

**Spec:** SKILL.md § 5.

**Pattern (frontend, `apps/web/instrumentation.client.ts`):**

```ts
import * as Sentry from '@sentry/nextjs'
Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, /* free-tier opts */ })

// When the user enters a match:
Sentry.setTag('matchId', matchId)
```

**Pattern (worker):**

```ts
import * as Sentry from '@sentry/cloudflare'
// In the DO fetch handler:
Sentry.setTag('matchId', this.state.id.toString())
```

Both runtimes share the **same** 5K-errors/month bucket — keep noise low.

---

## 15. No `console.log` in committed code

**Spec:** SKILL.md § 5.

Use a `logger` utility that no-ops in production and routes to Sentry
breadcrumbs in development.

---

## 16. MMR write is the last step of `endGame()`

**Spec:** SKILL.md § 3.6, § 5.

Write match + match_players rows first, then update TrueSkill. If MMR write
fails, retry; don't roll back the match data.

---

## 17. WebSocket auth — issuance + verification

**Spec:** SKILL.md § 5.

**Issuance** (Next.js Route Handler, `app/api/ws-token/route.ts`):

```ts
import { SignJWT } from 'jose'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const token = await new SignJWT({
    userId: session.user.id,
    displayName: session.user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.WS_SIGNING_SECRET))
  return Response.json({ token })
}
```

**Verification** (Worker, on WS upgrade):

```ts
import { jwtVerify } from 'jose'

const url = new URL(request.url)
const token = url.searchParams.get('token')
if (!token) return new Response(null, { status: 401 })
try {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(env.WS_SIGNING_SECRET))
  // payload.userId is now bound to the connection
} catch {
  return new Response(null, { status: 401 })
  // Or, after upgrade, close with code 4001.
}
```

`WS_SIGNING_SECRET` is shared between Next.js and the Worker (set in both
environments). HS256, 5-minute expiry.

---

## 18. `Origin` header validation on every WS upgrade

**Spec:** SKILL.md § 5.

Protects against cross-origin WebSocket hijacking.

**Pattern:**

```ts
const ALLOWED_ORIGINS = new Set([
  'https://coup.example.com',
  'http://localhost:3000',
])

if (!ALLOWED_ORIGINS.has(request.headers.get('Origin') ?? '')) {
  return new Response('Forbidden', { status: 403 })
}
```

---

## 19. Per-connection rate limiting — 30 messages / 5-second window

**Spec:** SKILL.md § 5.

**Pattern (in the DO):**

```ts
const RATE_WINDOW_MS = 5_000
const RATE_LIMIT = 30
const counters = new WeakMap<WebSocket, { count: number; windowStart: number }>()

function checkRate(ws: WebSocket): boolean {
  const now = Date.now()
  const c = counters.get(ws) ?? { count: 0, windowStart: now }
  if (now - c.windowStart > RATE_WINDOW_MS) {
    c.count = 0
    c.windowStart = now
  }
  c.count++
  counters.set(ws, c)
  if (c.count > RATE_LIMIT) {
    ws.send(JSON.stringify({
      type: 'rate-limit',
      retryAfterMs: RATE_WINDOW_MS - (now - c.windowStart),
    }))
    return false
  }
  return true
}
```

---

## 20. Hydration safety

**Spec:** SKILL.md § 5.

**Pattern (browser-only API):**

```tsx
'use client'
import { useState, useEffect } from 'react'

function ClientOnlyTimestamp() {
  // ✅ Stable across SSR / first client render.
  const [now] = useState(() => Date.now())
  return <span>{now}</span>
}
```

**Pattern (typed globalThis):**

```ts
// per SKILL.md § 5 — strict-mode-safe global access
const subtle = (globalThis as unknown as { crypto: { subtle: SubtleCrypto } }).crypto.subtle
```

**Pattern (deferred to effect):**

```tsx
'use client'
function NavigatorInfo() {
  const [lang, setLang] = useState<string | null>(null)
  useEffect(() => {
    setLang(navigator.language)
  }, [])
  return <span>{lang ?? '…'}</span>
}
```

---

## 21. Document in the right place

**Spec:** SKILL.md § 5 (added rule).

| What | Where |
|---|---|
| Cross-cutting rule (applies everywhere) | `SKILL.md` |
| Agent-facing convention (how to navigate the repo) | `AGENTS.md` |
| Deep-dive on one topic | `references/<topic>.md` |
| User-personal working rule (carries across projects) | `memory/feedback_<name>.md` |

If the target file or directory doesn't exist yet, **create it**. Don't leave
the knowledge in commit messages or chat.

---

## 22. Three-gate verification on every code change

**Spec:** SKILL.md § 5 (added rule).

Before reporting any code change as done:

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r build
```

Plus for `packages/game-logic`:

```bash
pnpm --filter @coup-online/game-logic test
```

Docs-only changes skip the gates. See SKILL.md § 5 for the full rule.

---

## 23. `eslint.config.mjs` per workspace sets `tsconfigRootDir`

**Spec:** SKILL.md § 5 (added rule).

**Pattern:**

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,  // ← required
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  globalIgnores(['node_modules/**', 'dist/**']),
])
```

Without `tsconfigRootDir`, VS Code's ESLint extension errors with "multiple
candidate TSConfigRootDirs are present" because the editor's cwd is the repo
root, not the workspace. `pnpm -r lint` from the CLI is unaffected.

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 5 (Critical Patterns to Apply Automatically) — the bullet list these patterns expand
- **What each pattern is fixing (the wrong-path alternatives):** [`anti-hallucination.md`](./anti-hallucination.md)
- **State-machine patterns deep dive:** [`state-machine.md`](./state-machine.md) — every action / challenge / block path, plus the queue/pool semantics referenced by § 1 (PlayerView slicing) and § 3 (phase guards)
- **Code-shape conventions (naming, imports, comments, tests, error handling):** [`code-style.md`](./code-style.md)
- **Deployment-side specifics (WS_SIGNING_SECRET sharing between Worker and Next.js, env var matrix):** [`deployment.md`](./deployment.md) — companion to § 17 here
