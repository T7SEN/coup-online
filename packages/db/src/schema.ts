import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
  // Profile crest customization. `profileColor` is a key into a fixed preset
  // palette (PROFILE_COLORS in apps/web/.../profile-colors.ts) — the banner
  // strip behind the avatar renders in that color. NOT NULL so the crest
  // always has a backdrop. `profileImage` is the patron-uploaded custom
  // banner image URL (R2-hosted). NULL for everyone today; when set it
  // takes precedence over `profileColor`.
  profileColor: text('profileColor').notNull().default('parchment'),
  profileImage: text('profileImage'),
  // ----- Patron storefront. -----
  // The patronage programme is cosmetic only (Coup Online is ranked — no
  // pay-to-win, see references/design-system.md). There is no payment
  // backend yet, so `isPatron` is flipped manually via `wrangler d1` for now
  // (see queries.ts → `grantPatronage` for the helper that also assigns
  // `founderRank`). Every column below is inert when `isPatron = 0`.
  //
  // The list mirrors the twelve privileges shown on /support.
  isPatron: integer('isPatron', { mode: 'boolean' }).notNull().default(false),
  // When the user first became a patron — used to derive ordering and a
  // "Patron since YYYY" label.
  patronSince: integer('patronSince', { mode: 'timestamp_ms' }),
  // 1–10 if the user is among the first ten patrons ever granted; NULL
  // otherwise. Assigned once at grant time and never changed — founding rank
  // survives even after the patron count grows past ten.
  founderRank: integer('founderRank'),
  // Short line displayed beneath the nickname on the profile. App enforces
  // a length cap (≤ 60 chars).
  patronMotto: text('patronMotto'),
  // Vanity URL slug — `/u/<slug>` resolves to this user. Unique across
  // users via the partial unique index in the migration. NULL until the
  // patron claims one.
  patronSlug: text('patronSlug'),
  // Render the nickname in gold leaf wherever it appears.
  patronGildedNickname: integer('patronGildedNickname', { mode: 'boolean' })
    .notNull()
    .default(false),
  // Card-back skin key for the cards held in the patron's hand. One of a
  // small preset set; NULL = the default back.
  patronCardBack: text('patronCardBack'),
  // Table-theme key for private rooms hosted by this patron. One of a small
  // preset set; NULL = the default felt.
  patronTableTheme: text('patronTableTheme'),
  // Default preferred custom code for private rooms — used as a fallback at
  // room-creation time when the patron doesn't type one explicitly. NULL
  // means the system generates a random code as today.
  patronVanityRoomCode: text('patronVanityRoomCode'),
  // Animated "living" banner on the profile — a gentle shimmer overlay on
  // top of the crest backdrop.
  patronShimmerBanner: integer('patronShimmerBanner', { mode: 'boolean' })
    .notNull()
    .default(false),
  // Short flourish that plays across the table the moment this patron wins
  // a match.
  patronVictoryFlourish: integer('patronVictoryFlourish', { mode: 'boolean' })
    .notNull()
    .default(false),
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
}, (u) => ({
  // Vanity slug must be unique across users. SQLite treats every NULL in a
  // unique index as distinct, so unset slugs never collide.
  patronSlugIdx: uniqueIndex('user_patronSlug_unique').on(u.patronSlug),
}))

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
// Admin audit log
// ============================================================================
// Append-only record of admin-write actions. Inserted from the admin
// endpoints in apps/game-server (grant/revoke patron, etc.); never updated
// in place. Used to answer "who did what, when?" after the fact.
//
// `payload` is JSON-encoded — defensive (parse errors don't break reads).
// Schema kept narrow on purpose: the audit log isn't the place to mirror
// every cosmetic, just enough to identify the action and any rank/since
// timestamps the action set.

export const adminAudit = sqliteTable(
  'admin_audit',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => webCrypto.randomUUID()),
    // Who performed the action. References user.id — never null (every
    // audit row is initiated by an authenticated admin session).
    adminUserId: text('adminUserId')
      .notNull()
      .references(() => user.id),
    // Action verb — short snake_case identifier (e.g. 'grant_patron',
    // 'revoke_patron'). Free-form so future admin actions don't need a
    // migration to land here.
    action: text('action').notNull(),
    // Subject of the action. Nullable so future admin actions that aren't
    // user-targeted (e.g. global config tweaks) can still log a row.
    targetUserId: text('targetUserId').references(() => user.id),
    // JSON-encoded extras. Caller decides shape per action.
    payload: text('payload'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (a) => ({
    // Most reads are "newest-first, paginate" — covered by a single index
    // on createdAt.
    createdAtIdx: index('admin_audit_created_at_idx').on(a.createdAt),
    // Lookups by target ("show me everything done to user X").
    targetIdx: index('admin_audit_target_idx').on(a.targetUserId),
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
export type AdminAudit = typeof adminAudit.$inferSelect
export type NewAdminAudit = typeof adminAudit.$inferInsert
