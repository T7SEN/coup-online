import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { alias } from 'drizzle-orm/sqlite-core'
import {
  account,
  adminAudit,
  appSettings,
  friendRequests,
  friends,
  matchActive,
  matchPlayers,
  matches,
  mmrHistory,
  passkey,
  session,
  twoFactor,
  user,
  type NewMatch,
  type NewMatchPlayer,
  type NewMmrHistory,
} from './schema'

// All queries take the Drizzle D1 database handle as their first argument so
// the Worker can manage instance lifecycle. Construct via createDb(env.DB)
// in `apps/game-server/src/`.

export type Db = DrizzleD1Database<Record<string, never>>

// ----------------------------------------------------------------------------
// Users
// ----------------------------------------------------------------------------

export async function getUserById(db: Db, id: string) {
  const rows = await db.select().from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

export async function getUserByEmail(db: Db, email: string) {
  const rows = await db.select().from(user).where(eq(user.email, email)).limit(1)
  return rows[0] ?? null
}

// Profile edits. `displayName` is the project-side nickname (shown in-game and
// on the leaderboard, falling back to `name`); `image` is the avatar URL —
// after a custom upload, a Worker /api/avatars/* URL. Callers validate input.
export async function updateUserDisplayName(
  db: Db,
  userId: string,
  displayName: string,
) {
  await db.update(user).set({ displayName }).where(eq(user.id, userId))
}

export async function updateUserImage(db: Db, userId: string, image: string) {
  await db.update(user).set({ image }).where(eq(user.id, userId))
}

// Patron custom banner — stored on `user.profileImage` (the column was added
// in 0001_shallow_vargas as groundwork for this perk). `image` is the
// Worker-side URL that serves the R2 object; pass `null` to clear the
// banner and fall back to the preset profileColor backdrop.
export async function updateUserProfileImage(
  db: Db,
  userId: string,
  image: string | null,
) {
  await db.update(user).set({ profileImage: image }).where(eq(user.id, userId))
}

// Profile crest banner color — one of a fixed preset palette. The caller
// (Worker /api/me/profile PATCH) validates the key against the allowed set
// before this runs.
export async function updateUserProfileColor(
  db: Db,
  userId: string,
  profileColor: string,
) {
  await db.update(user).set({ profileColor }).where(eq(user.id, userId))
}

// The provider ids a user has linked (e.g. ['google', 'discord']). Empty for
// a magic-link-only account — magic link creates no `account` row. Powers the
// "sign-in method" line on the settings page.
export async function getUserAccountProviders(
  db: Db,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))
  return rows.map((r) => r.providerId)
}

// Account deletion — anonymize, not hard-delete. `match` / `match_player` /
// `mmr_history` reference `user.id`, so the row must survive for referential
// integrity (and the leaderboard / match summaries); it stays as an inert
// "Deleted player". Everything that is PII or a sign-in path is purged:
// linked accounts, sessions, and friend edges. With no `account` and no
// `session` rows the identity can never be used to sign in again.
// `anonEmail` must be unique (the email column is UNIQUE) — callers pass a
// per-user sentinel such as `deleted-<userId>@deleted.invalid`.
export async function deleteUserAccount(
  db: Db,
  userId: string,
  anonEmail: string,
) {
  await db.batch([
    db.delete(account).where(eq(account.userId, userId)),
    db.delete(session).where(eq(session.userId, userId)),
    // 2FA enrollment + WebAuthn credentials are sign-in paths — purge them
    // so the anonymised identity truly cannot sign in again.
    db.delete(twoFactor).where(eq(twoFactor.userId, userId)),
    db.delete(passkey).where(eq(passkey.userId, userId)),
    db
      .delete(friends)
      .where(
        or(eq(friends.userId, userId), eq(friends.friendUserId, userId)),
      ),
    db
      .delete(friendRequests)
      .where(
        or(
          eq(friendRequests.fromUserId, userId),
          eq(friendRequests.toUserId, userId),
        ),
      ),
    db
      .update(user)
      .set({
        name: 'Deleted player',
        displayName: 'Deleted player',
        email: anonEmail,
        image: null,
        profileImage: null,
        // Patron storefront — anonymising a patron releases their slug for
        // someone else to claim, blanks the motto, and disables the cosmetic
        // toggles. `isPatron` is dropped too, but `founderRank` and
        // `patronSince` survive so the Hall of Patrons keeps showing the slot
        // (with "Deleted player" as the inscription).
        isPatron: false,
        patronMotto: null,
        patronSlug: null,
        patronGildedNickname: false,
        patronCardBack: null,
        patronTableTheme: null,
        patronVanityRoomCode: null,
        patronShimmerBanner: false,
        patronVictoryFlourish: false,
        // Drop the 2FA pointer too — the row in `twoFactor` is already gone
        // above; flipping this back to false matches the post-delete state.
        twoFactorEnabled: false,
      })
      .where(eq(user.id, userId)),
  ])
}

// Count enrolled passkeys for a user — surfaced on /api/me/account so the
// Settings page can show the right state (zero passkeys: "Add a passkey";
// N passkeys: list them). Cheap one-row aggregate.
export async function countUserPasskeys(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(passkey)
    .where(eq(passkey.userId, userId))
  return Number(rows[0]?.n ?? 0)
}

// ----------------------------------------------------------------------------
// Matches
// ----------------------------------------------------------------------------

export async function getMatchById(db: Db, matchId: string) {
  const rows = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1)
  return rows[0] ?? null
}

export async function getMatchPlayersForMatch(db: Db, matchId: string) {
  return db.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId))
}

// All seats of one match joined with each player's display identity — powers
// the match-summary page. Ordered by finishing position (1 = winner first).
// Patron columns (`isPatron`, `founderRank`, `patronGildedNickname`) come
// through so the summary can render the supporter crest + gilded name beside
// each seat.
export async function getMatchParticipants(db: Db, matchId: string) {
  return db
    .select({
      userId: matchPlayers.userId,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      isPatron: user.isPatron,
      founderRank: user.founderRank,
      patronGildedNickname: user.patronGildedNickname,
      seat: matchPlayers.seat,
      finishingPosition: matchPlayers.finishingPosition,
      muBefore: matchPlayers.muBefore,
      sigmaBefore: matchPlayers.sigmaBefore,
      muAfter: matchPlayers.muAfter,
      sigmaAfter: matchPlayers.sigmaAfter,
    })
    .from(matchPlayers)
    .innerJoin(user, eq(user.id, matchPlayers.userId))
    .where(eq(matchPlayers.matchId, matchId))
    .orderBy(matchPlayers.finishingPosition)
}

// User's recent matches with their per-seat outcome. Ordered newest-first.
export async function getUserMatchHistory(
  db: Db,
  userId: string,
  limit = 20,
  offset = 0,
) {
  return db
    .select({
      matchId: matches.id,
      startedAt: matches.startedAt,
      endedAt: matches.endedAt,
      seatCount: matches.seatCount,
      winnerUserId: matches.winnerUserId,
      finishingPosition: matchPlayers.finishingPosition,
      muBefore: matchPlayers.muBefore,
      muAfter: matchPlayers.muAfter,
      sigmaBefore: matchPlayers.sigmaBefore,
      sigmaAfter: matchPlayers.sigmaAfter,
    })
    .from(matches)
    .innerJoin(matchPlayers, eq(matchPlayers.matchId, matches.id))
    .where(eq(matchPlayers.userId, userId))
    .orderBy(desc(matches.endedAt))
    .limit(limit)
    .offset(offset)
}

// All-time match count + wins for a user — for the profile page's win rate.
// Counted over every match_player row, not just the recent-history slice.
export async function getUserMatchStats(db: Db, userId: string) {
  const rows = await db
    .select({
      played: sql<number>`count(*)`,
      wins: sql<number>`sum(case when ${matchPlayers.finishingPosition} = 1 then 1 else 0 end)`,
    })
    .from(matchPlayers)
    .where(eq(matchPlayers.userId, userId))
  return {
    played: Number(rows[0]?.played ?? 0),
    wins: Number(rows[0]?.wins ?? 0),
  }
}

// ----------------------------------------------------------------------------
// Leaderboard — SKILL.md § 3.6 conservative rating (mu - 3*sigma).
// ----------------------------------------------------------------------------

export async function getLeaderboardTop100(db: Db) {
  // Per-user match totals, aggregated over every match_player row.
  //
  // Filter: a user has to have won at least one match to be ranked. Two
  // reasons:
  //   1. New sign-ups otherwise flood the board with the starting rating
  //      (mu=25, sigma=25/3 → conservative 0). A leaderboard that's mostly
  //      "people who clicked Sign in once" buries the actual players.
  //   2. Profile pages for never-played users have almost nothing to show
  //      (no match history, no rating trend). Surfacing them to strangers
  //      via the leaderboard creates dead-end clicks.
  //
  // INNER JOIN drops users with zero match_player rows entirely; the
  // `wins > 0` filter then drops users who've only ever lost. Win-rate-less
  // players will reappear once they win their first match.
  const stats = db
    .select({
      userId: matchPlayers.userId,
      played: sql<number>`count(*)`.as('played'),
      wins: sql<number>`sum(case when ${matchPlayers.finishingPosition} = 1 then 1 else 0 end)`.as(
        'wins',
      ),
    })
    .from(matchPlayers)
    .groupBy(matchPlayers.userId)
    .as('stats')

  return db
    .select({
      id: user.id,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      isPatron: user.isPatron,
      founderRank: user.founderRank,
      patronGildedNickname: user.patronGildedNickname,
      mu: user.mu,
      sigma: user.sigma,
      rating: sql<number>`(${user.mu} - 3 * ${user.sigma})`.as('rating'),
      played: stats.played,
      wins: stats.wins,
    })
    .from(user)
    .innerJoin(stats, eq(stats.userId, user.id))
    .where(sql`${stats.wins} > 0`)
    .orderBy(sql`rating DESC`)
    .limit(100)
}

// Player search — case-insensitive substring match on the project nickname
// (displayName) or the provider name, ordered by conservative rating. Powers
// the leaderboard search box. SQLite LIKE is case-insensitive for ASCII, and
// nicknames are English-only (packages/protocol `validateDisplayName`), so a
// plain LIKE suffices. `played` / `wins` come from the same match_player
// aggregate the leaderboard uses; they are NULL for users with no matches.
export async function searchUsersByName(db: Db, query: string, limit = 20) {
  // Strip LIKE wildcards so user input can't widen its own match.
  const term = query.replace(/[%_\\]/g, '').trim()
  if (term.length === 0) return []
  const pattern = `%${term}%`

  const stats = db
    .select({
      userId: matchPlayers.userId,
      played: sql<number>`count(*)`.as('played'),
      wins: sql<number>`sum(case when ${matchPlayers.finishingPosition} = 1 then 1 else 0 end)`.as(
        'wins',
      ),
    })
    .from(matchPlayers)
    .groupBy(matchPlayers.userId)
    .as('stats')

  return db
    .select({
      id: user.id,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      isPatron: user.isPatron,
      founderRank: user.founderRank,
      patronGildedNickname: user.patronGildedNickname,
      mu: user.mu,
      sigma: user.sigma,
      rating: sql<number>`(${user.mu} - 3 * ${user.sigma})`.as('rating'),
      played: stats.played,
      wins: stats.wins,
    })
    .from(user)
    .leftJoin(stats, eq(stats.userId, user.id))
    .where(or(like(user.displayName, pattern), like(user.name, pattern)))
    .orderBy(sql`rating DESC`)
    .limit(limit)
}

// Leaderboard standing for a given conservative rating — 1 + the count of
// users rated strictly higher. Powers the rank badge on the profile page.
// Ties (extremely rare on a continuous float rating) share a rank.
export async function getRankForRating(db: Db, rating: number) {
  const rows = await db
    .select({ above: sql<number>`count(*)` })
    .from(user)
    .where(sql`(${user.mu} - 3 * ${user.sigma}) > ${rating}`)
  return Number(rows[0]?.above ?? 0) + 1
}

// ----------------------------------------------------------------------------
// Patron storefront — SKILL.md / references/design-system.md.
// ----------------------------------------------------------------------------
// All twelve patron privileges live as columns on `user` (see schema.ts).
// There is no payment integration yet; `isPatron` is flipped manually via
// `wrangler d1` using `grantPatronage` below, which also assigns the founder
// rank when applicable. Everything else is just a getter/setter on the row.

// The first ten patrons granted, ordered by founderRank ASC. Powers the
// public Hall of Patrons page. We return whichever founder slots have been
// filled — fewer than ten means the rest of the Hall stays vacant.
export async function getFoundingPatrons(db: Db) {
  return db
    .select({
      userId: user.id,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      founderRank: user.founderRank,
      patronSlug: user.patronSlug,
      patronSince: user.patronSince,
    })
    .from(user)
    .where(sql`${user.founderRank} IS NOT NULL`)
    .orderBy(user.founderRank)
    .limit(10)
}

// Resolve a vanity slug to its user row, or null. Used by the vanity-URL
// route (/u/<slug>, future) and by the slug-availability check below.
export async function getUserByPatronSlug(db: Db, slug: string) {
  const rows = await db
    .select()
    .from(user)
    .where(eq(user.patronSlug, slug))
    .limit(1)
  return rows[0] ?? null
}

// True iff `slug` is unclaimed (case-sensitive, exact match — the slug
// validator already normalises before calling this).
export async function isPatronSlugAvailable(db: Db, slug: string) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.patronSlug, slug))
    .limit(1)
  return rows.length === 0
}

// Grant patronage to a user. Called from admin tooling (wrangler d1 + a
// helper script, or a future payment-webhook handler). Idempotent: if the
// user is already a patron, leaves their `patronSince` and `founderRank`
// alone. Founder rank is assigned only on first grant and only if there
// are fewer than 10 founders already.
//
// This is NOT exposed as an HTTP route — patronage cannot be self-granted.
export async function grantPatronage(db: Db, userId: string) {
  const me = await getUserById(db, userId)
  if (!me) throw new Error(`grantPatronage: user ${userId} not found`)
  if (me.isPatron) return // idempotent

  // Count existing founders to decide whether this grant earns a rank.
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)
    .where(sql`${user.founderRank} IS NOT NULL`)
  const founderCount = Number(rows[0]?.count ?? 0)
  const founderRank = founderCount < 10 ? founderCount + 1 : null

  await db
    .update(user)
    .set({
      isPatron: true,
      patronSince: new Date(),
      founderRank,
    })
    .where(eq(user.id, userId))
}

// Revoke patronage. Sets isPatron = false and clears the cosmetic toggles
// (including the custom banner image URL), but DELIBERATELY leaves
// `founderRank` and `patronSince` in place — once someone is founder #N,
// that slot is theirs forever (the Hall keeps showing the seat with their
// name). Same logic that `deleteUserAccount` applies on anonymise, exposed
// here as its own helper for the admin tool.
//
// NOTE: the R2 object behind `profileImage` is NOT deleted here — R2 lives
// on the Worker, not in this package. The admin endpoint that calls this
// also calls `env.AVATARS.delete('banners/<userId>')` so the object can't
// outlive the URL.
export async function revokePatronage(db: Db, userId: string) {
  await db
    .update(user)
    .set({
      isPatron: false,
      profileImage: null,
      patronMotto: null,
      patronSlug: null,
      patronGildedNickname: false,
      patronCardBack: null,
      patronTableTheme: null,
      patronVanityRoomCode: null,
      patronShimmerBanner: false,
      patronVictoryFlourish: false,
    })
    .where(eq(user.id, userId))
}

// Admin user search — case-insensitive substring match across email,
// displayName, and provider name. Returns enough data for the admin tool to
// identify the user and act on them. Used only by the admin endpoint, so the
// shape exposes more PII (email) than the public search.
export async function searchUsersForAdmin(db: Db, query: string, limit = 25) {
  const term = query.replace(/[%_\\]/g, '').trim()
  if (term.length === 0) return []
  const pattern = `%${term}%`
  return db
    .select({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      profileImage: user.profileImage,
      isPatron: user.isPatron,
      patronSince: user.patronSince,
      founderRank: user.founderRank,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      or(
        like(user.email, pattern),
        like(user.displayName, pattern),
        like(user.name, pattern),
      ),
    )
    .orderBy(desc(user.createdAt))
    .limit(limit)
}

// ----------------------------------------------------------------------------
// Moderation — ban / unban + identity clears.
// ----------------------------------------------------------------------------

// Ban a user. Stamps `bannedAt` and stores the admin-provided reason; the
// Worker checks `bannedAt IS NOT NULL` at every game-creating chokepoint
// (WS upgrade, ws-token mint, future matchmaking) and refuses. Idempotent —
// rebanning a banned user just refreshes `bannedAt` and overrides the reason.
export async function banUser(db: Db, userId: string, reason: string | null) {
  await db
    .update(user)
    .set({
      bannedAt: new Date(),
      banReason: reason ?? null,
    })
    .where(eq(user.id, userId))
}

export async function unbanUser(db: Db, userId: string) {
  await db
    .update(user)
    .set({ bannedAt: null, banReason: null })
    .where(eq(user.id, userId))
}

// Quick ban check for hot paths. Returns true if the user row exists AND
// `bannedAt` is set. Unknown user IDs return false (treat as not-banned;
// the caller's session/auth gate handles "no such user" upstream).
export async function isUserBanned(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ bannedAt: user.bannedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.bannedAt != null
}

// Admin "scrub" — null out user-controlled identity fields without deleting
// the account. Each flag is independent so the caller can clear just the
// displayName (offensive nickname) without also wiping the avatar. R2
// deletes for avatar / banner live in the Worker — this only touches D1.
//
// `displayName` reset → NULL: the leaderboard / profile fallback chain
// renders `user.name` (the provider's name) instead. The user can pick a
// new one via the Settings page exactly as on first sign-in.
export interface ClearIdentityOpts {
  readonly displayName?: boolean
  readonly avatar?: boolean
  readonly banner?: boolean
}

export async function clearUserIdentity(
  db: Db,
  userId: string,
  opts: ClearIdentityOpts,
) {
  const patch: Partial<typeof user.$inferInsert> = {}
  if (opts.displayName) patch.displayName = null
  if (opts.avatar) patch.image = null
  if (opts.banner) patch.profileImage = null
  if (Object.keys(patch).length === 0) return
  await db.update(user).set(patch).where(eq(user.id, userId))
}

// ----------------------------------------------------------------------------
// Active-match registry — written by the GameRoom DO, read by admin.
// ----------------------------------------------------------------------------

// Called by the GameRoom DO on LOBBY → IN_GAME. Idempotent via INSERT OR
// REPLACE: if a stale row exists for the same matchId (e.g. a crashed DO
// that never deregistered), the new game's start overwrites it.
export async function registerActiveMatch(
  db: Db,
  args: {
    readonly matchId: string
    readonly startedAt: Date
    readonly seatCount: number
    readonly hostUserId: string
  },
) {
  await db
    .insert(matchActive)
    .values({
      matchId: args.matchId,
      startedAt: args.startedAt,
      seatCount: args.seatCount,
      hostUserId: args.hostUserId,
    })
    .onConflictDoUpdate({
      target: matchActive.matchId,
      set: {
        startedAt: args.startedAt,
        seatCount: args.seatCount,
        hostUserId: args.hostUserId,
      },
    })
}

// Called by the GameRoom DO on game-end (normal or force-end). Idempotent —
// deleting an already-absent row is a no-op.
export async function deregisterActiveMatch(db: Db, matchId: string) {
  await db.delete(matchActive).where(eq(matchActive.matchId, matchId))
}

// Active-match list for the admin "Live games" panel. Joined with the host
// user so the UI can show "hosted by Alice" without a second round-trip.
// Newest first; limit is a soft cap (free tier rarely has >20 simultaneous
// games today).
export async function getActiveMatches(db: Db, limit = 50) {
  return db
    .select({
      matchId: matchActive.matchId,
      startedAt: matchActive.startedAt,
      seatCount: matchActive.seatCount,
      hostUserId: matchActive.hostUserId,
      hostDisplayName: user.displayName,
      hostName: user.name,
    })
    .from(matchActive)
    .leftJoin(user, eq(user.id, matchActive.hostUserId))
    .orderBy(desc(matchActive.startedAt))
    .limit(limit)
}

// ----------------------------------------------------------------------------
// Global app settings — single-key reads + writes for operational toggles.
// ----------------------------------------------------------------------------

// Maintenance mode shape. `enabled = true` → Worker refuses game-creating
// endpoints AND the Next.js layout shows a banner / redirects to /maintenance
// per the layout logic. `message` is the admin-supplied note rendered in the
// banner; empty string = banner shows a default copy.
export interface MaintenanceSetting {
  readonly enabled: boolean
  readonly message: string
}

const MAINTENANCE_KEY = 'maintenance'

export async function getMaintenanceSetting(
  db: Db,
): Promise<MaintenanceSetting & { updatedAt: Date | null }> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, MAINTENANCE_KEY))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return { enabled: false, message: '', updatedAt: null }
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<MaintenanceSetting>
    return {
      enabled: parsed.enabled === true,
      message: typeof parsed.message === 'string' ? parsed.message : '',
      updatedAt: row.updatedAt,
    }
  } catch {
    // Corrupt payload — treat as off rather than crashing the read. The
    // admin can re-set the value via the UI to recover.
    return { enabled: false, message: '', updatedAt: row.updatedAt }
  }
}

export async function setMaintenanceSetting(
  db: Db,
  args: {
    readonly enabled: boolean
    readonly message: string
    readonly updatedBy: string
  },
) {
  const value = JSON.stringify({
    enabled: args.enabled,
    message: args.message,
  } satisfies MaintenanceSetting)
  await db
    .insert(appSettings)
    .values({
      key: MAINTENANCE_KEY,
      value,
      updatedAt: new Date(),
      updatedBy: args.updatedBy,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: new Date(),
        updatedBy: args.updatedBy,
      },
    })
}

// ----------------------------------------------------------------------------
// Admin quota strip — row counts per table for the free-tier health panel.
// ----------------------------------------------------------------------------
// D1 free tier is 5 GB; the row counts are a proxy for "how full are we"
// without having to call the Cloudflare API. R2 object stats are produced
// by the Worker (R2 binding isn't reachable from the db package), so this
// helper covers D1 only.

export interface DbCounts {
  readonly users: number
  readonly matches: number
  readonly matchPlayers: number
  readonly mmrHistory: number
  readonly activeMatches: number
  readonly sessions: number
  readonly auditEntries: number
}

export async function getDbCounts(db: Db): Promise<DbCounts> {
  const [u, m, mp, mh, ma, s, aa] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(user),
    db.select({ n: sql<number>`count(*)` }).from(matches),
    db.select({ n: sql<number>`count(*)` }).from(matchPlayers),
    db.select({ n: sql<number>`count(*)` }).from(mmrHistory),
    db.select({ n: sql<number>`count(*)` }).from(matchActive),
    db.select({ n: sql<number>`count(*)` }).from(session),
    db.select({ n: sql<number>`count(*)` }).from(adminAudit),
  ])
  return {
    users: Number(u[0]?.n ?? 0),
    matches: Number(m[0]?.n ?? 0),
    matchPlayers: Number(mp[0]?.n ?? 0),
    mmrHistory: Number(mh[0]?.n ?? 0),
    activeMatches: Number(ma[0]?.n ?? 0),
    sessions: Number(s[0]?.n ?? 0),
    auditEntries: Number(aa[0]?.n ?? 0),
  }
}

// ----------------------------------------------------------------------------
// Season / leaderboard reset — admin-triggered factory reset of MMR state.
// ----------------------------------------------------------------------------
// Wipes every match, every match_player row, every mmr_history entry, and
// resets each user's denormalized mu / sigma back to the TrueSkill defaults.
// The user table itself (accounts, displayNames, patron flags, avatars) is
// left untouched — only the "played a game" side of the world is rolled back.
//
// After this runs the leaderboard query (wins > 0 filter, see
// getLeaderboardTop100) returns an empty list until somebody wins a match.
//
// Atomic via db.batch(): D1 either applies every statement or none.
//
// The default values are inlined rather than imported from @coup-online/rating
// to avoid an inter-package dep just for two constants. Source of truth lives
// in packages/rating/src/constants.ts (INITIAL_MU=25, INITIAL_SIGMA=25/3);
// SKILL.md § 3.6 pins the same numbers.
const RESET_MU = 25
const RESET_SIGMA = 25 / 3

export interface ResetMmrCounts {
  readonly matches: number
  readonly matchPlayers: number
  readonly mmrHistory: number
  readonly usersReset: number
}

export async function resetMmrAndMatches(db: Db): Promise<ResetMmrCounts> {
  // Snapshot counts BEFORE the delete so the audit log can report exactly
  // what disappeared. The user count is the row-count of the UPDATE rather
  // than a destructive measure — it tells the admin "this reset touched N
  // user rows" so they can sanity-check.
  const [m, mp, mh, u] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(matches),
    db.select({ c: sql<number>`count(*)` }).from(matchPlayers),
    db.select({ c: sql<number>`count(*)` }).from(mmrHistory),
    db.select({ c: sql<number>`count(*)` }).from(user),
  ])

  // Order matters even with FK CASCADE: mmr_history first (references both
  // user and match via informational FKs), then match_player (cascade-deletes
  // when matches go but we delete explicitly so the count is honest), then
  // matches, then reset every user's denormalized rating in place.
  await db.batch([
    db.delete(mmrHistory),
    db.delete(matchPlayers),
    db.delete(matches),
    db.update(user).set({
      mu: RESET_MU,
      sigma: RESET_SIGMA,
    }),
  ])

  return {
    matches: Number(m[0]?.c ?? 0),
    matchPlayers: Number(mp[0]?.c ?? 0),
    mmrHistory: Number(mh[0]?.c ?? 0),
    usersReset: Number(u[0]?.c ?? 0),
  }
}

// ----------------------------------------------------------------------------
// Admin audit log — append-only history of admin-write actions.
// ----------------------------------------------------------------------------
// Inserts are called from the Worker right after each admin action succeeds;
// the table is never updated in place. Reads are newest-first with a small
// page size for the admin UI.

export interface InsertAdminAuditInput {
  readonly adminUserId: string
  readonly action: string
  readonly targetUserId?: string | null
  readonly payload?: string | null
}

export async function insertAdminAudit(
  db: Db,
  entry: InsertAdminAuditInput,
): Promise<void> {
  await db.insert(adminAudit).values({
    adminUserId: entry.adminUserId,
    action: entry.action,
    targetUserId: entry.targetUserId ?? null,
    payload: entry.payload ?? null,
  })
}

// Paginated audit-log read for the admin console. Joins user twice (alias)
// to surface both the admin's and the target's display name in one query —
// avoids N+1 fetches on the rendering side.
export async function getAdminAuditLog(
  db: Db,
  limit = 50,
  offset = 0,
) {
  const adminUser = alias(user, 'adminUser')
  const targetUser = alias(user, 'targetUser')
  return db
    .select({
      id: adminAudit.id,
      adminUserId: adminAudit.adminUserId,
      adminDisplayName: adminUser.displayName,
      adminName: adminUser.name,
      action: adminAudit.action,
      targetUserId: adminAudit.targetUserId,
      targetDisplayName: targetUser.displayName,
      targetName: targetUser.name,
      payload: adminAudit.payload,
      createdAt: adminAudit.createdAt,
    })
    .from(adminAudit)
    .leftJoin(adminUser, eq(adminUser.id, adminAudit.adminUserId))
    .leftJoin(targetUser, eq(targetUser.id, adminAudit.targetUserId))
    .orderBy(desc(adminAudit.createdAt))
    .limit(limit)
    .offset(offset)
}

// Aggregate counts for the admin overview strip. Cheap — three SELECTs over
// the `user` table, no joins.
export async function getAdminStats(db: Db) {
  const [totalRows, patronRows, founderRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(user),
    db
      .select({ n: sql<number>`count(*)` })
      .from(user)
      .where(eq(user.isPatron, true)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(user)
      .where(sql`${user.founderRank} IS NOT NULL`),
  ])
  return {
    totalUsers: Number(totalRows[0]?.n ?? 0),
    activePatrons: Number(patronRows[0]?.n ?? 0),
    founderSlotsUsed: Number(founderRows[0]?.n ?? 0),
  }
}

// PATCH the patron-controlled bits of the user's storefront. Caller passes
// only the fields it wants to change. Caller is also responsible for input
// validation (length caps on motto, slug shape + uniqueness, preset-set
// membership for cardBack / tableTheme, etc.) — this function blindly writes
// what it's given.
export interface PatronSettingsPatch {
  patronMotto?: string | null
  patronSlug?: string | null
  patronGildedNickname?: boolean
  patronCardBack?: string | null
  patronTableTheme?: string | null
  patronVanityRoomCode?: string | null
  patronShimmerBanner?: boolean
  patronVictoryFlourish?: boolean
}

export async function updatePatronSettings(
  db: Db,
  userId: string,
  patch: PatronSettingsPatch,
) {
  await db.update(user).set(patch).where(eq(user.id, userId))
}

// ----------------------------------------------------------------------------
// Rating history — for the profile page's rating-over-time graph.
// ----------------------------------------------------------------------------

export async function getUserRatingHistory(db: Db, userId: string, limit = 50) {
  return db
    .select()
    .from(mmrHistory)
    .where(eq(mmrHistory.userId, userId))
    .orderBy(desc(mmrHistory.createdAt))
    .limit(limit)
}

// ----------------------------------------------------------------------------
// Friends
// ----------------------------------------------------------------------------

export async function getFriendsList(db: Db, userId: string) {
  return db
    .select({
      friendUserId: friends.friendUserId,
      createdAt: friends.createdAt,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
    })
    .from(friends)
    .innerJoin(user, eq(user.id, friends.friendUserId))
    .where(eq(friends.userId, userId))
}

export async function getIncomingFriendRequests(db: Db, userId: string) {
  return db
    .select({
      fromUserId: friendRequests.fromUserId,
      createdAt: friendRequests.createdAt,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
    })
    .from(friendRequests)
    .innerJoin(user, eq(user.id, friendRequests.fromUserId))
    .where(eq(friendRequests.toUserId, userId))
}

export async function getOutgoingFriendRequests(db: Db, userId: string) {
  return db
    .select({
      toUserId: friendRequests.toUserId,
      createdAt: friendRequests.createdAt,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
    })
    .from(friendRequests)
    .innerJoin(user, eq(user.id, friendRequests.toUserId))
    .where(eq(friendRequests.fromUserId, userId))
}

// ----------------------------------------------------------------------------
// Match result persistence — SKILL.md § 3.6.
// ----------------------------------------------------------------------------

// Inputs aggregated from packages/rating's RatingDelta + game-logic's final state.
// One call writes: matches row, N match_player rows, N mmr_history rows,
// and updates user.mu / user.sigma for each player.
//
// D1's batch API is invoked via db.batch() for atomicity. SKILL.md § 5 — this
// is the LAST step of endGame(); if it fails, retry (don't roll back match data
// elsewhere).
export interface InsertMatchResultInput {
  readonly match: NewMatch
  readonly players: readonly NewMatchPlayer[]
  readonly history: readonly NewMmrHistory[]
}

export async function insertMatchResult(db: Db, input: InsertMatchResultInput) {
  const updates = input.players.map((p) =>
    db
      .update(user)
      .set({ mu: p.muAfter, sigma: p.sigmaAfter })
      .where(eq(user.id, p.userId)),
  )
  const inserts = [
    db.insert(matches).values(input.match),
    db.insert(matchPlayers).values([...input.players]),
    db.insert(mmrHistory).values([...input.history]),
  ]
  // db.batch() takes a non-empty tuple of prepared statements. We have at least
  // one of each (one match + N≥3 players + N≥3 history rows + N≥3 user updates).
  const ops = [...inserts, ...updates] as unknown as Parameters<typeof db.batch>[0]
  await db.batch(ops)
}

// ----------------------------------------------------------------------------
// Friend mutations
// ----------------------------------------------------------------------------

export async function sendFriendRequest(
  db: Db,
  fromUserId: string,
  toUserId: string,
) {
  await db.insert(friendRequests).values({ fromUserId, toUserId })
}

// Accept a pending friend request: insert two friend rows (A→B and B→A) and
// delete the pending request. Atomic via db.batch().
export async function acceptFriendRequest(
  db: Db,
  fromUserId: string,
  toUserId: string,
) {
  await db.batch([
    db.insert(friends).values({ userId: fromUserId, friendUserId: toUserId }),
    db.insert(friends).values({ userId: toUserId, friendUserId: fromUserId }),
    db
      .delete(friendRequests)
      .where(
        and(
          eq(friendRequests.fromUserId, fromUserId),
          eq(friendRequests.toUserId, toUserId),
        ),
      ),
  ])
}

export async function rejectFriendRequest(
  db: Db,
  fromUserId: string,
  toUserId: string,
) {
  await db
    .delete(friendRequests)
    .where(
      and(
        eq(friendRequests.fromUserId, fromUserId),
        eq(friendRequests.toUserId, toUserId),
      ),
    )
}

export async function removeFriend(db: Db, userId: string, otherUserId: string) {
  await db.batch([
    db
      .delete(friends)
      .where(
        and(eq(friends.userId, userId), eq(friends.friendUserId, otherUserId)),
      ),
    db
      .delete(friends)
      .where(
        and(eq(friends.userId, otherUserId), eq(friends.friendUserId, userId)),
      ),
  ])
}
