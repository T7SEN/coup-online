# DB Schema — D1 / Drizzle

Companion to SKILL.md § 2 / § 3.6. Lives in `packages/db/`. Single source of
truth for the persistence layer.

**Critical architectural rule (SKILL.md § 2):** the Worker owns D1 exclusively.
`apps/web` never imports `drizzle-orm/d1` and never receives a D1 binding.
Auth.js adapter operations (user upsert, verification-token CRUD for magic
links) are proxied from Next.js to the Worker via internal HTTP endpoints.

---

## Stack

| Piece | Choice | Why |
|---|---|---|
| Database | Cloudflare D1 (SQLite) | Free 5 GB, Workers-native binding (SKILL.md § 2 / § 6) |
| ORM | `drizzle-orm` v0.36 | Edge-compatible, type-safe, no Prisma (SKILL.md § 6) |
| Migration tool | `drizzle-kit` v0.28 | Generates SQL from schema diff; deploy via wrangler |
| Migration apply | `wrangler d1 migrations apply` | Native Cloudflare D1 tooling |
| SQL dialect | SQLite (D1) | No Postgres-isms — see SKILL.md § 6 |

## Tables (8 total)

### Auth.js v5 tables — shape dictated by `@auth/drizzle-adapter`

#### `user`
Auth.js managed identity plus project-specific extensions (`displayName`, `mu`,
`sigma`, `createdAt`). Mu/sigma are **denormalized here** so the leaderboard
query is a single `SELECT … ORDER BY (mu − 3·sigma) DESC LIMIT 100`.

| Column | Type | Notes |
|---|---|---|
| `id` | text PRIMARY KEY | UUID; `$defaultFn(() => crypto.randomUUID())` |
| `name` | text NULL | From OAuth provider |
| `email` | text NOT NULL UNIQUE | Required; provider must supply |
| `emailVerified` | integer (ms) NULL | Verification timestamp |
| `image` | text NULL | Avatar URL from provider |
| `displayName` | text NULL | Project-side display name (onboarding flow fills) |
| `mu` | real NOT NULL DEFAULT 25 | TrueSkill (SKILL.md § 3.6) |
| `sigma` | real NOT NULL DEFAULT 8.333… | TrueSkill |
| `createdAt` | integer (ms) NOT NULL | `unixepoch() * 1000` |

#### `account`
OAuth account links. One user can have multiple (Google + Discord). Compound
PK on `(provider, providerAccountId)`.

| Column | Type | Notes |
|---|---|---|
| `userId` | text NOT NULL → `user.id` cascade | |
| `type` | text NOT NULL | `'oauth' \| 'oidc' \| 'email'` |
| `provider` | text NOT NULL | `'google' \| 'discord' \| 'resend'` |
| `providerAccountId` | text NOT NULL | Provider-side user ID |
| `refresh_token`, `access_token`, `expires_at`, `token_type`, `scope`, `id_token`, `session_state` | various NULL | OAuth fields |

Index: `account_userId_idx` on `(userId)` for "all accounts for user X" lookups.

#### `verificationToken`
Email magic-link tokens. Compound PK on `(identifier, token)`.

| Column | Type |
|---|---|
| `identifier` | text NOT NULL |
| `token` | text NOT NULL |
| `expires` | integer (ms) NOT NULL |

### Match history

#### `match`
One row per completed match. `winnerUserId` is denormalized for the most
common query ("matches won by user X").

| Column | Type | Notes |
|---|---|---|
| `id` | text PRIMARY KEY | DO-generated UUID |
| `startedAt` | integer (ms) NOT NULL | |
| `endedAt` | integer (ms) NOT NULL | |
| `winnerUserId` | text NOT NULL → `user.id` | |
| `seatCount` | integer NOT NULL | 3–6 |

Index: `match_winner_idx` on `(winnerUserId)`.

#### `match_player`
N rows per match, one per seat. Carries per-seat outcome including pre- and
post-match ratings. Compound PK on `(matchId, userId)`.

| Column | Type | Notes |
|---|---|---|
| `matchId` | text NOT NULL → `match.id` cascade | |
| `userId` | text NOT NULL → `user.id` | |
| `seat` | integer NOT NULL | 0-indexed seat order at game start |
| `finishingPosition` | integer NOT NULL | 1-indexed (1 = winner) — matches `packages/rating` |
| `muBefore` | real NOT NULL | |
| `sigmaBefore` | real NOT NULL | |
| `muAfter` | real NOT NULL | |
| `sigmaAfter` | real NOT NULL | |

Index: `match_player_userId_idx` on `(userId)` for "matches X played in".

#### `mmr_history`
Append-only audit log of rating changes. Powers the rating-over-time graph on
the profile page. Separate from `match_player` so per-user queries don't have
to join through `match`.

| Column | Type | Notes |
|---|---|---|
| `id` | text PRIMARY KEY | UUID |
| `userId` | text NOT NULL → `user.id` | |
| `matchId` | text NULL → `match.id` set null | NULL allows non-match adjustments |
| `muBefore`, `sigmaBefore`, `muAfter`, `sigmaAfter` | real NOT NULL | |
| `createdAt` | integer (ms) NOT NULL | `unixepoch() * 1000` |

Index: `mmr_history_user_time_idx` on `(userId, createdAt)` — covers the
rating-graph query.

### Social

#### `friend`
Bidirectional friendship. On accept, the server writes **two rows** (A→B and
B→A) so each user's friends list is a simple `WHERE userId = ?`. Compound PK
on `(userId, friendUserId)`.

| Column | Type |
|---|---|
| `userId` | text NOT NULL → `user.id` cascade |
| `friendUserId` | text NOT NULL → `user.id` cascade |
| `createdAt` | integer (ms) NOT NULL |

#### `friend_request`
Pending requests. Directed (from → to). Disappears on accept (turns into two
`friend` rows) or reject (just deleted). Compound PK on `(fromUserId, toUserId)`.

| Column | Type |
|---|---|
| `fromUserId` | text NOT NULL → `user.id` cascade |
| `toUserId` | text NOT NULL → `user.id` cascade |
| `createdAt` | integer (ms) NOT NULL |

Index: `friend_request_to_idx` on `(toUserId)` for "pending requests TO me".

---

## Foreign-key enforcement

D1 inherits SQLite's foreign-key behavior. By default, FK constraints are
**defined but not enforced** unless `PRAGMA foreign_keys = ON` is set per
connection. D1 enables this by default in newer versions, but the schema
should not rely on enforcement for correctness — the application's
transactional writes (via `db.batch()`) ensure consistency.

FK definitions are kept in the schema for:
- Type safety (Drizzle's typed query builder)
- Documentation of relationships
- Cascade behavior when D1 does enforce

---

## Migrations

### Generating

From `packages/db/`:

```bash
pnpm generate          # short for: pnpm exec drizzle-kit generate
```

Creates a new `drizzle/migrations/NNNN_<name>.sql` plus `meta/` updates.
Inspect the generated SQL before committing.

### Applying

Migrations are applied via wrangler from the game-server workspace:

```bash
# Local D1 (miniflare-backed sqlite during wrangler dev)
pnpm --filter @coup-online/game-server exec wrangler d1 migrations apply \
  coup-online-db --local

# Production D1
pnpm --filter @coup-online/game-server exec wrangler d1 migrations apply \
  coup-online-db --remote
```

Wrangler tracks applied migrations against the D1 instance and won't re-apply.

### Immutability — SKILL.md § 5

Once a migration is committed and applied to any deployed environment, **never
edit it**. Add a new migration for any subsequent change. Editing a shipped
migration causes hash mismatches; the migration log thinks the migration is
applied but the schema doesn't reflect the edit. State drift between dev and
production follows.

---

## Queries

Reusable query builders in `packages/db/src/queries.ts`. All take the Drizzle
D1 handle (`Db`) as the first argument; the Worker creates the handle once per
request or DO instance:

```ts
import { createDb } from '@coup-online/db'
const db = createDb(env.DB)
```

### Users
- `getUserById(db, id)`
- `getUserByEmail(db, email)`

### Matches
- `getMatchById(db, matchId)`
- `getMatchPlayersForMatch(db, matchId)` — for game-end persistence
- `getUserMatchHistory(db, userId, limit?, offset?)` — joins match × match_player, ordered by `endedAt DESC`

### Leaderboard
- `getLeaderboardTop100(db)` — selects `(mu − 3·sigma) AS rating`, orders by `rating DESC`, limit 100

### Rating graph
- `getUserRatingHistory(db, userId, limit?)` — from `mmr_history` ordered newest-first

### Friends
- `getFriendsList(db, userId)` — joins friend × user
- `getIncomingFriendRequests(db, userId)` — joins friend_request × user
- `getOutgoingFriendRequests(db, userId)`

### Mutations
- `sendFriendRequest(db, fromUserId, toUserId)`
- `acceptFriendRequest(db, fromUserId, toUserId)` — atomically inserts 2 friend rows + deletes the pending request via `db.batch()`
- `rejectFriendRequest(db, fromUserId, toUserId)`
- `removeFriend(db, userId, otherUserId)` — atomically deletes both rows via `db.batch()`
- `insertMatchResult(db, { match, players, history })` — atomic match-end write via `db.batch()`: one `match` row + N `match_player` rows + N `mmr_history` rows + N `user.mu/sigma` updates

### Atomicity via `db.batch()`

D1 doesn't expose traditional SQL transactions to Workers. Instead, `db.batch()`
takes an array of prepared statements and runs them as a single atomic
operation. The Drizzle D1 adapter exposes this. Use it for any multi-statement
write that must be all-or-nothing — friend accepts, match results, etc.

---

## Type re-exports

Every table's `$inferSelect` and `$inferInsert` types are re-exported with
clean names:

```ts
import type { User, NewUser, Match, NewMatchPlayer /* etc. */ } from '@coup-online/db'
```

`Select` types describe a row read from the DB. `New*` types describe what's
allowed at insert time (defaults omitted, etc.).

---

## v1 limitations / TBD

- **No session table.** Auth.js v5 uses JWT sessions by default in this
  project (not DB sessions), so no `session` table is defined.
- **No D1 sessions API integration yet.** D1 supports a per-connection
  sessions API for read-your-writes consistency; the Worker doesn't use it
  yet. May matter for cases like "user just sent a friend request and
  immediately re-fetches their outgoing list."
- **No FTS indexes.** SQLite FTS5 is available; not used yet. Would enable
  user search by displayName / email.
- **No soft-delete on `user`.** Account deletion is hard cascade. If the
  project ever needs GDPR-style soft delete + retention, that's an additive
  migration.
- **Friend bidirectionality enforced by application, not the DB.** The DB
  allows asymmetric friendship (only A→B) but the application always writes
  both rows. A future trigger could enforce, but D1's trigger support is
  limited.

---

## Where to extend

| To add… | Touch |
|---|---|
| A new table | `src/schema.ts` → run `pnpm generate` → commit migration |
| A new common query | `src/queries.ts`, exported from `index.ts` via barrel |
| A column on an existing table | `src/schema.ts` → run `pnpm generate` → drizzle-kit emits an `ALTER TABLE` migration |
| A non-trivial schema change | `src/schema.ts` → `pnpm generate` → inspect the SQL → may need a hand-edited migration for data migration; never edit a shipped one |
| Drizzle relations API | `src/schema.ts` — add `relations()` definitions; opt-in feature |

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 2 (Persistence — `packages/db`), § 3.6 (TrueSkill + Match Persistence), § 5 (Drizzle migrations are checked-in and immutable)
- **What goes in the rating columns:** [`rating.md`](./rating.md)
- **State-machine context for match writes (when endGame() fires):** [`state-machine.md`](./state-machine.md)
- **Why Drizzle (not Prisma), D1 (not Neon), SQLite SQL (not Postgres-isms):** [`anti-hallucination.md`](./anti-hallucination.md) — Database section
- **Worker-owned D1 access pattern (Next.js never imports `drizzle-orm/d1`):** [`SKILL.md`](../SKILL.md) § 2, [`anti-hallucination.md`](./anti-hallucination.md)
- **The "immutable migrations" rule:** [`coding-patterns.md`](./coding-patterns.md) § 6
- **Source:** `packages/db/src/` — `schema.ts`, `queries.ts`, `index.ts`
- **Migrations:** `packages/db/drizzle/migrations/`
- **Apply command:** see [`deployment.md`](./deployment.md) — Production deploy — game-server section
