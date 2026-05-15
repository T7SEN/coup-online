import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// SKILL.md § 2 — Persistence layer.
// D1 (SQLite) accessed exclusively from the Worker via the `DB` binding.
// Drizzle is the ORM (Workers-native, edge-compatible; no Prisma — SKILL.md § 6).
// All columns use SQLite-portable types (text / integer / real). No JSONB,
// no native arrays, no Postgres-isms (SKILL.md § 6).

// Web Crypto handle. crypto is global in both Cloudflare Workers and Node 20+
// (drizzle-kit migration generation runs in Node). globalThis cast is the
// SKILL.md § 5 strict-mode pattern for browser-global access.
const webCrypto = (
  globalThis as unknown as { crypto: { randomUUID(): string } }
).crypto

// ============================================================================
// Auth.js v5 tables
// ============================================================================
// Shape dictated by `@auth/drizzle-adapter`. Table and column names must stay
// as-is for the adapter to find them. The Worker proxies Auth.js adapter calls
// from Next.js (Worker-owned D1 per SKILL.md § 2 / § 6).

export const users = sqliteTable('user', {
  // Server-generated UUID via crypto.randomUUID() (SKILL.md § 5 — Web Crypto only).
  id: text('id')
    .primaryKey()
    .$defaultFn(() => webCrypto.randomUUID()),
  // Display name from the OAuth provider. NULL until the user picks one or the
  // OAuth provider returned one.
  name: text('name'),
  // Email from the provider; UNIQUE because each user has at most one.
  email: text('email').notNull().unique(),
  // Auth.js convention — set to the timestamp the email was verified, NULL otherwise.
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  // Avatar URL from the OAuth provider, NULL otherwise.
  image: text('image'),
  // ----- Coup-specific extensions on the same row (denormalized for the
  //       leaderboard query — SELECT … ORDER BY mu - 3*sigma DESC LIMIT 100). -----
  // Project-side display name. May be NULL on first sign-in; user picks one
  // during onboarding (apps/web/(app)/profile flow, future).
  displayName: text('displayName'),
  // TrueSkill rating. Defaults match SKILL.md § 3.6.
  mu: real('mu').notNull().default(25),
  sigma: real('sigma').notNull().default(25.0 / 3.0),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const accounts = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'oauth' | 'oidc' | 'email'
    provider: text('provider').notNull(), // 'google' | 'discord' | 'resend' (magic link)
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
    userIdIdx: index('account_userId_idx').on(account.userId),
  }),
)

export const verificationTokens = sqliteTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
)

// ============================================================================
// Match history (SKILL.md § 3.6)
// ============================================================================
// On game end, the GameRoom DO writes (in one D1 transaction):
//   - One `matches` row
//   - N `match_players` rows (one per seat)
//   - N `mmr_history` deltas
// and updates each user's denormalized `mu` / `sigma` on `user`.
// Per SKILL.md § 5, the MMR write is the LAST step of endGame().

export const matches = sqliteTable(
  'match',
  {
    // matchId — DO-generated UUID via crypto.randomUUID() (SKILL.md § 5).
    id: text('id').primaryKey(),
    startedAt: integer('startedAt', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('endedAt', { mode: 'timestamp_ms' }).notNull(),
    // FK is informational — SQLite doesn't enforce by default and D1's behavior
    // varies. The DO ensures consistency in the transactional write.
    winnerUserId: text('winnerUserId')
      .notNull()
      .references(() => users.id),
    seatCount: integer('seatCount').notNull(), // 3-6 per SKILL.md § 1
  },
  (m) => ({
    winnerIdx: index('match_winner_idx').on(m.winnerUserId),
  }),
)

export const matchPlayers = sqliteTable(
  'match_player',
  {
    matchId: text('matchId')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => users.id),
    // 0-indexed seat order at game start (immutable for the match — SKILL.md § 4.2).
    seat: integer('seat').notNull(),
    // 1-indexed finishing position (1 = winner). Matches packages/rating's
    // SeatResult.finishingPosition convention.
    finishingPosition: integer('finishingPosition').notNull(),
    muBefore: real('muBefore').notNull(),
    sigmaBefore: real('sigmaBefore').notNull(),
    muAfter: real('muAfter').notNull(),
    sigmaAfter: real('sigmaAfter').notNull(),
  },
  (mp) => ({
    compoundKey: primaryKey({ columns: [mp.matchId, mp.userId] }),
    userIdIdx: index('match_player_userId_idx').on(mp.userId),
  }),
)

// Append-only audit log of rating changes per user per match. Powers the
// rating-over-time graph on the profile page. Separate from `match_player`
// for fast `WHERE userId = ? ORDER BY createdAt` queries that don't need
// the full match record.
export const mmrHistory = sqliteTable(
  'mmr_history',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => webCrypto.randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => users.id),
    // Nullable to support non-match rating adjustments (admin corrections,
    // future seasonal resets) without forging a synthetic match row.
    matchId: text('matchId').references(() => matches.id, { onDelete: 'set null' }),
    muBefore: real('muBefore').notNull(),
    sigmaBefore: real('sigmaBefore').notNull(),
    muAfter: real('muAfter').notNull(),
    sigmaAfter: real('sigmaAfter').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (h) => ({
    userTimeIdx: index('mmr_history_user_time_idx').on(h.userId, h.createdAt),
  }),
)

// ============================================================================
// Social — friends + friend requests
// ============================================================================
// Friends are bidirectional. On accept, the server inserts TWO rows (A→B, B→A).
// Friend requests are directed (fromUserId → toUserId) and disappear on accept
// or reject.

export const friends = sqliteTable(
  'friend',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendUserId: text('friendUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (f) => ({
    compoundKey: primaryKey({ columns: [f.userId, f.friendUserId] }),
  }),
)

export const friendRequests = sqliteTable(
  'friend_request',
  {
    fromUserId: text('fromUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: text('toUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (fr) => ({
    compoundKey: primaryKey({ columns: [fr.fromUserId, fr.toUserId] }),
    toIdx: index('friend_request_to_idx').on(fr.toUserId),
  }),
)

// ============================================================================
// Inferred row types — re-exported for consumers.
// ============================================================================

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert
export type Match = typeof matches.$inferSelect
export type NewMatch = typeof matches.$inferInsert
export type MatchPlayer = typeof matchPlayers.$inferSelect
export type NewMatchPlayer = typeof matchPlayers.$inferInsert
export type MmrHistory = typeof mmrHistory.$inferSelect
export type NewMmrHistory = typeof mmrHistory.$inferInsert
export type Friend = typeof friends.$inferSelect
export type NewFriend = typeof friends.$inferInsert
export type FriendRequest = typeof friendRequests.$inferSelect
export type NewFriendRequest = typeof friendRequests.$inferInsert
