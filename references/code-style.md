# Code Style

Conventions used across this repo. SKILL.md § 5 covers architectural patterns;
this file is about the *shape* of the code that implements them. Where two
styles conflict between the Next.js-scaffolded `apps/web/` and the
hand-written packages, that's called out.

---

## TypeScript

### Strict mode everywhere

Every workspace's `tsconfig.json` has `"strict": true`. No exceptions.

### Prefer `interface` for state shapes; `type` for unions and aliases

```ts
// ✅ State shapes — extendable via declaration merging if ever needed.
export interface GameState {
  matchId: MatchId
  phase: Phase
  // ...
}

// ✅ Unions and computed types.
export type Phase =
  | 'AWAITING_ACTION'
  | 'CHALLENGE_WINDOW'
  | 'CHALLENGE_RESOLUTION'
  // ...
```

In practice, `Phase` (and other protocol types) come from `z.infer<typeof Phase>`,
which produces a `type`. That's fine — the schema is the source of truth.

### Use `readonly` to mark immutable fields

```ts
export interface ServerInfluence {
  readonly status: 'face-down' | 'revealed'
  readonly kind: CardKind
}

export interface ServerSeat {
  readonly playerId: PlayerId      // never changes after seat assignment
  readonly displayName: string     // ditto
  coins: number                    // mutable during play
  isAlive: boolean                 // mutable
  // ...
}
```

`readonly` is documentation as much as enforcement — it signals to readers
which fields can change during the game.

### Discriminated unions for state variants

`status: 'face-down' | 'revealed'` etc. with a literal discriminant. Lets
TypeScript narrow exhaustively in `switch` statements.

```ts
function sliceInfluence(inf: ServerInfluence, isSelf: boolean): Influence {
  if (inf.status === 'revealed') return { status: 'revealed', kind: inf.kind }
  if (isSelf) return { status: 'face-down', kind: inf.kind }
  return { status: 'hidden' }
}
```

### No `any` in source code

ESLint blocks via `@typescript-eslint/no-explicit-any` (default in
`tseslint.configs.recommended`). For genuinely-untyped JS interop, prefer
`unknown` with explicit narrowing.

```ts
// ❌
function parse(x: any) { /* ... */ }

// ✅
function parse(x: unknown): SomeShape {
  if (typeof x !== 'object' || x === null) throw new Error('…')
  // narrow further
}
```

The only allowed `any` in this repo is one line in `test/deck.test.ts` that
verifies the frozen `DECK` array rejects mutation, with an explicit
`eslint-disable` comment.

### `globalThis` for browser globals on the worker side

Per SKILL.md § 5, avoid pulling in the DOM lib (`dom` in tsconfig) since it
would let server code accidentally reference `document`, `window`, etc.
Instead, cast `globalThis`:

```ts
const webCrypto = (
  globalThis as unknown as {
    crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T }
  }
).crypto
```

Hoisted to a module-level constant; not re-cast at each call site.

---

## Naming

| Kind | Convention | Example |
|---|---|---|
| Variables, functions, parameters | `camelCase` | `actorPlayerId`, `applyTax` |
| Types, classes, Zod schemas | `PascalCase` | `GameState`, `PlayerView`, `IllegalActionError` |
| Compile-time constants | `SCREAMING_SNAKE_CASE` | `MIN_PLAYERS`, `STARTING_COINS`, `DECK` |
| File names | `kebab-case.ts` | `do-game-room.ts`, `player-view.ts` |
| Test files | `<source-name>.test.ts` | `deck.ts` → `deck.test.ts` |
| Intentionally unused parameter / variable | `_`-prefix | `_request` |

### Boolean-returning functions and properties

Prefix with `is`, `has`, `can`, etc.

```ts
isAlive, isDisconnected, isMe          // properties
checkWinner, isEliminated              // functions (well — checkWinner returns
                                       // PlayerId | null, but that's still a
                                       // truthy-check)
```

### Error class naming

`*Error` suffix. Carries a stable `code` field where the error might cross a
serialization boundary (e.g., wire to client).

```ts
export class IllegalActionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'IllegalActionError'
  }
}

export class UnknownPlayerError extends Error { /* ... */ }
```

---

## Functions

### Pure where possible

`packages/game-logic` is the layer where purity matters most. Most functions
take state, mutate it in place, and return the same reference for chaining
convenience.

**Mutation is OK in DO-owned single-threaded code** — the Cloudflare runtime
serializes message processing per DO instance, so aliasing concerns don't
apply. But:

- The mutation contract is **documented at the function level** (`Mutates state
  in place and returns the same reference for convenience`).
- Tests can assert `expect(applyIncome(state, 'p0')).toBe(state)` to lock the
  contract.

If a future need arises for an immutable layer (e.g., for time-travel
debugging), it'd wrap the mutating functions, not replace them.

### Validation first, mutation last

Action handlers follow a strict order:

```ts
export function applyTax(state: GameState, actorPlayerId: PlayerId): GameState {
  // 1. Phase guard
  requirePhase(state, 'AWAITING_ACTION')
  // 2. Resolve subjects
  const actor = getActor(state, actorPlayerId)
  // 3. Authorization checks
  requireTurnOwnership(state, actorPlayerId)
  requireAlive(actor)
  // 4. Action-specific guards
  requireNotForcedToCoup(actor)
  // 5. Mutate
  state.phase = 'CHALLENGE_WINDOW'
  state.pendingAction = { actorPlayerId, action: { kind: 'Tax' } }
  return state
}
```

If any validation throws, no mutation has occurred.

### One-purpose functions

`applyActionEffect`, `replaceCardWithDraw`, `resolveAfterEffects`, `concludeTurn`
each have one job. Don't bundle "apply effect AND advance phase AND check
winner" into one function — split them so the call sites can reorder if needed.

### Throw with stable codes for protocol-friendly errors

```ts
throw new IllegalActionError(
  'must_coup',  // ← stable, machine-readable code
  `Player "${actor.playerId}" has ${actor.coins} coins and must Coup`,  // human msg
)
```

The `code` is what the server's `server-messages::error.code` field carries.
Renaming a code is a protocol break — treat them like API symbols.

---

## Imports

### Order

1. Side-effect imports (`'use server'` etc.) — rare
2. External packages
3. Workspace packages (`@coup-online/...`)
4. Relative imports (`./`, `../`)

```ts
import { z } from 'zod'                                          // external
import type { CardKind } from '@coup-online/protocol'            // workspace
import { DECK, randomIntBelow, shuffle } from './deck'           // relative
import type { GameState } from './state'
```

Within each group, alphabetize.

### Type-only imports

Use `import type` when you only need the type. Smaller bundle, clearer intent.

```ts
import type { CardKind } from '@coup-online/protocol'
import { z } from 'zod'                  // value import — not type-only
```

When importing from a module that has both type and value usage, two lines:

```ts
import type { GameState } from './state'
import { applyIncome } from './actions'
```

### Avoid `import * as ns`

Use named imports.

```ts
// ❌
import * as zod from 'zod'

// ✅
import { z } from 'zod'
```

---

## Comments

### Why, not what

Code shows *what*; comments justify *why*.

```ts
// ❌
// Increment coins by 3.
actor.coins += 3

// ✅
// SKILL.md § 4.4 — Duke → Tax: take 3 coins.
actor.coins += 3
```

### Cite SKILL.md sections inline

When implementing a game rule, comment the section being enforced.

```ts
// SKILL.md § 4.6 — when a character claim is challenged and PROVEN, the claimant
// returns the proven card to the Court Deck, the deck is reshuffled, and the
// claimant draws a fresh replacement.
export function replaceCardWithDraw(/* ... */) { /* ... */ }
```

### TODO format

```ts
// TODO(win-condition.ts): if fewer than 2 players are alive after this point,
// transition to GAME_OVER and stop advancing.
```

Includes the **target** (file/feature it's deferring to) for searchability.

### Defensive-check comments

When adding a check that "should never happen" but exists for robustness, say so.

```ts
// Defensive: turn-advance skips eliminated seats, so the turn-holder should
// always be alive. Catching the inverse here means a state-inconsistency bug
// surfaces here rather than silently producing wrong game results.
function requireAlive(seat: ServerSeat): void { /* ... */ }
```

---

## Tests

### Use Vitest

`packages/game-logic` runs Vitest. Other packages will too as they grow.

### Co-locate or sibling-locate

Test files live in a sibling `test/` folder, not next to the source file:

```
packages/game-logic/
├── src/
│   ├── deck.ts
│   ├── actions.ts
│   └── ...
└── test/
    ├── deck.test.ts
    ├── actions.test.ts
    └── ...
```

(Alternative would be `__tests__` next to source; we picked sibling. Don't
mix.)

### One concept per `describe`

```ts
describe('applyIncome — happy path', () => { /* ... */ })
describe('applyIncome — rejection cases', () => { /* ... */ })
describe('turn advancement', () => { /* ... */ })
```

### Assert error codes via try/catch (idiomatic for stable-code errors)

```ts
try {
  applyIncome(state, 'p1')
  throw new Error('expected throw')
} catch (e) {
  expect(e).toBeInstanceOf(IllegalActionError)
  expect((e as IllegalActionError).code).toBe('not_your_turn')
}
```

Vitest's `.toThrow()` checks the message but not custom `code` fields cleanly.
The try/catch pattern is explicit and readable.

### Fixtures via local helpers, not shared

Each test file defines its own `makeState` / `setupTaxState` / etc. fixtures.
A shared fixture file would tightly couple test files; the duplication is
worth it for isolation. Per-action test files (`steal.test.ts`, etc.) each
have a fixture tailored to that action's scenarios.

### Don't test internal helpers directly

If a function is private (not exported), its behavior is exercised through
the public entry points. Tests targeting private helpers tend to assume
implementation details and break on refactor.

The validation helpers (`requirePhase`, `getActor`, etc.) ARE exported — they
get tested through every action handler that uses them.

---

## Error handling

### Two categories

| Category | Throw | Use |
|---|---|---|
| **Programmer error** (state inconsistency, impossible code path) | `new Error(message)` | Internal — surfaces as 500 or unhandled rejection |
| **Game-logic error** (illegal move, validation failure) | `new IllegalActionError(code, message)` | Protocol-visible — surfaces as a `server-messages::error` |

```ts
// Programmer error — should never happen in practice.
if (card.status !== 'face-down') {
  throw new Error(`replaceCardWithDraw: card at index ${cardIdx} must be face-down`)
}

// Game-logic error — codifies an illegal action by a player.
throw new IllegalActionError(
  'card_already_revealed',
  `Card at index ${cardIndex} is already revealed`,
)
```

### Don't swallow errors

No empty `catch {}` blocks. If you must catch, log + re-throw or transform
into a different shape.

The one exception is the test pattern above where we **expect** a throw.

### Never throw plain strings

```ts
// ❌
throw 'bad'

// ✅
throw new Error('bad')
```

---

## Async patterns

### `await` is mandatory in Next.js 16 for `cookies()` / `headers()`

```ts
import { cookies, headers } from 'next/headers'

export async function getSession() {
  const cookieStore = await cookies()    // ← await
  const headerList = await headers()     // ← await
  // ...
}
```

### No floating promises

ESLint's `@typescript-eslint/no-floating-promises` (in `recommended-type-checked`)
catches these; for now we run `recommended` only, so be deliberate.

```ts
// ❌
asyncOp()    // ignored

// ✅
await asyncOp()
// or
void asyncOp()   // intentionally fire-and-forget
```

---

## Formatting

### Two styles in the repo

| Workspace | Quotes | Semicolons | Trailing commas | Reason |
|---|---|---|---|---|
| `packages/*`, `apps/game-server/` | Single | None | Yes | What I've been writing |
| `apps/web/` | Double | Yes | Yes | Next.js scaffold (`create-next-app` default) |

Not great, but acceptable since each workspace is self-consistent and the
boundary is a workspace edge (not a file edge). A future Prettier config could
unify; not blocking.

### Indentation: 2 spaces, no tabs

Universal across the repo.

### Line length: ~100-110 chars soft limit

ESLint doesn't enforce; just don't write 200-char lines that wrap weirdly in
a review tool. JSDoc-style comments wrap at ~80 for readability.

---

## File organization

### One main concept per file

`actions.ts` has all the action handlers because they're a coherent family.
`blocks.ts` has block-related handlers. `challenges.ts` has challenge-related.
The shared validation helpers live in `actions.ts` because that's where they
were first used; if they grow, they'd graduate to their own `validation.ts`.

### Barrel `index.ts` per package

```ts
// packages/game-logic/src/index.ts
export * from './state'
export * from './deck'
export * from './setup'
export * from './player-view'
export * from './win-condition'
export * from './actions'
export * from './challenges'
export * from './blocks'
```

External consumers import from the barrel; internal cross-file imports go
direct (`from './state'`) because the barrel adds a circular-import risk if
internals reach back through it.

### `package.json` `main`/`types`/`exports`

Library packages (protocol, game-logic) emit to `dist/`:

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"]
}
```

Apps (web, game-server) don't have these fields — they're not published, just
deployed.

---

## Configuration files

### `tsconfig.json`

Library packages use:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

Notes:
- `lib: ["ES2022"]` only — no DOM types in pure-logic packages.
- `moduleResolution: "Bundler"` matches modern bundler behavior.
- `isolatedModules: true` ensures each file is independently transpilable.

Apps inherit from this shape but add their environment-specific bits (Next.js
plugin for web; `types: ["@cloudflare/workers-types"]` historically for the
Worker — now replaced by `wrangler types`-generated `worker-configuration.d.ts`).

### `eslint.config.mjs`

Flat config per workspace. Required block (per SKILL.md § 5):

```js
{
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
  },
}
```

The `tsconfigRootDir` setting is what unblocks VS Code's ESLint extension.

### `package.json` scripts

Every workspace exposes the same script names where they make sense, so
`pnpm -r <script>` works from root:

| Script | Required for | Notes |
|---|---|---|
| `typecheck` | every workspace | `tsc --noEmit` |
| `lint` | every workspace | `eslint` |
| `build` | every workspace | varies (next build / tsc / wrangler dry-run) |
| `test` | packages with tests | `vitest run` |
| `dev` | apps | `next dev` / `wrangler dev` |

### `wrangler.toml`

Comments cite SKILL.md sections for non-obvious choices. `new_sqlite_classes`
gets a callout that `new_classes` is forbidden (paid-plan only).

---

## Commit and PR style

(For when human contributors arrive; agents currently don't commit unless
explicitly asked.)

- One concept per commit.
- Commit messages: imperative present tense, ~50 chars first line, body explains *why*.
- PR descriptions include: what changed, why, how to verify.
- Reference SKILL.md sections in commit / PR body for design-decision changes.

---

## See also

- **Canonical spec for what to do (the patterns):** [`coding-patterns.md`](./coding-patterns.md) — architectural patterns this style serves
- **Canonical spec for what NOT to do:** [`anti-hallucination.md`](./anti-hallucination.md), [`SKILL.md`](../SKILL.md) § 6
- **State-machine type shapes (`GameState`, `ServerInfluence`, etc.):** [`state-machine.md`](./state-machine.md)
- **SKILL.md auto-applied rules that overlap with style:** [`SKILL.md`](../SKILL.md) § 5 (`dir="auto"`, no `console.log`, `'use server'` files export only async functions, etc.)
- **Test conventions in source:** `packages/game-logic/test/*.test.ts` — every test file follows the patterns in this doc
