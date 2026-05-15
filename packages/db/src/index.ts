import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

export * from './schema'
export * from './queries'

// Factory for the Worker-side Drizzle handle. Called once per request (or once
// per DO instance) with the D1 binding from env.
//
// Usage in apps/game-server:
//   import { createDb } from '@coup-online/db'
//   const db = createDb(env.DB)
//   const user = await getUserById(db, userId)
//
// SKILL.md § 2 — D1 access is Worker-exclusive. Never import this from
// apps/web; the Next.js side proxies through Worker HTTP endpoints.
export function createDb(d1: D1Database): DrizzleD1Database<Record<string, never>> {
  return drizzle(d1)
}
