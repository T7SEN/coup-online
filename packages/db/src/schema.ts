import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// SKILL.md § 2 — Persistence layer.
// D1 (SQLite) accessed exclusively from the Worker via the `DB` binding.
// Drizzle is the ORM (Workers-native, edge-compatible; no Prisma — SKILL.md § 6).
// All columns use SQLite-portable types (text / integer / real). No JSONB,
// no native arrays, no Postgres-isms (SKILL.md § 6).
//
// Auth tables follow Better Auth's expected shape (better-auth.com/docs).
// Schema exports for auth tables are SINGULAR (`user`, `session`, `account`,
// `verification`) to match Better Auth's default model names — that lets the
// Drizzle adapter find them without an explicit schema map. Match / social
// tables stay plural (existing convention).

// Web Crypto handle. crypto is global in both Cloudflare Workers and Node 20+
// (drizzle-kit migration generation runs in Node). globalThis cast is the
// SKILL.md § 5 strict-mode pattern for browser-global access.
const webCrypto = (
  globalThis as unknown as { crypto: { randomUUID(): string } }
).crypto

// ============================================================================
// Better Auth tables — shape dictated by better-auth/adapters/drizzle.
// ============================================================================

export const user = sqliteTable('user', {
  // Server-generated UUID via crypto.randomUUID() (SKILL.md § 5 — Web Crypto only).
  id: text('id')
    .primaryKey()
    .$defaultFn(() => webCrypto.randomUUID()),
  // Display name from the OAuth provider; required by Better Auth (see skill).
  name: text('name').notNull(),
  // Email from the provider; UNIQUE because each user has at most one.
  email: text('email').notNull().unique(),
  // Better Auth uses BOOLEAN here (not a timestamp). SQLite stores as integer
  // 0/1 via Drizzle's boolean mode.
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
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
  // Better Auth maintains createdAt / updatedAt on every auth table.
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

// Better Auth's DB-backed session. Cookie cache (60s) skips this for hot reads.
export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Opaque session token stored in the cookie. Better Auth makes this unique.
    token: text('token').notNull().unique(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (s) => ({
    userIdIdx: index('session_userId_idx').on(s.userId),
  }),
)

// OAuth provider account links + credential-provider rows (the `password`
// column is for the credentials provider; nullable for OAuth-only accounts).
// Column names follow Better Auth conventions: providerId (was provider),
// accountId (was providerAccountId), camelCase token fields.
export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerId: text('providerId').notNull(), // 'google' | 'discord' | 'credential' | …
    accountId: text('accountId').notNull(), // Provider-side user ID
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    // Credentials provider hash. Unused while we're OAuth + magic link only;
    // present so the schema doesn't have to change if we add email/password
    // later.
    password: text('password'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (a) => ({
    userIdIdx: index('account_userId_idx').on(a.userId),
    providerIdx: index('account_provider_idx').on(a.providerId, a.accountId),
  }),
)

// Generic "verification" entries — used for magic links, email verification,
// password reset, etc.
export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (v) => ({
    identifierIdx: index('verification_identifier_idx').on(v.identifier),
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
      .references(() => user.id),
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
      .references(() => user.id),
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
      .references(() => user.id),
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
      .references(() => user.id, { onDelete: 'cascade' }),
    friendUserId: text('friendUserId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
      .references(() => user.id, { onDelete: 'cascade' }),
    toUserId: text('toUserId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert
export type Account = typeof account.$inferSelect
export type NewAccount = typeof account.$inferInsert
export type Verification = typeof verification.$inferSelect
export type NewVerification = typeof verification.$inferInsert
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
