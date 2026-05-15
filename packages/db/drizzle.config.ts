import type { Config } from 'drizzle-kit'

// drizzle-kit generates SQLite migrations from `src/schema.ts`.
//
// Migrations are applied to D1 separately via wrangler from the game-server
// workspace:
//   pnpm --filter @coup-online/game-server exec wrangler d1 migrations apply \
//     coup-online-db --remote   # or --local for dev
//
// SKILL.md § 5 — once a migration ships, it's immutable. Edit only by
// adding a new migration; never modify an existing one.
export default {
  schema: './src/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
} satisfies Config
