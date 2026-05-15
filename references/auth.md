# Auth — Better Auth wiring & flow

Companion to SKILL.md § 5 / § 6. Documents the production sign-in flow,
provider setup, and how Better Auth co-locates with D1 on the Worker
runtime. **Always cross-reference [better-auth.com/docs](https://better-auth.com/docs)
for current API.**

---

## Goal

Players sign in via Google OAuth, Discord OAuth, or email magic link. There
is no guest play (SKILL.md § 1). After sign-in, a 5-minute JWT issued by
the Worker authorizes the WebSocket upgrade.

---

## High-level architecture

Auth lives on the **Worker** (Cloudflare), not Next.js, because:

1. SKILL.md § 2 says D1 is Worker-owned. Better Auth + Drizzle adapter +
   D1 binding all sit on the same runtime → no HTTP-DB bridge.
2. The Worker is where the WebSocket auth happens anyway (`verifyJwt`), so
   keeping the entire auth surface in one place tightens the threat model.

Next.js's role is the **browser interface plus a transparent proxy**. The
browser hits `/api/auth/*` and `/api/ws-token` on the Vercel origin (so
cookies scope to that origin); Next.js's `rewrites()` in
[`apps/web/next.config.ts`](../apps/web/next.config.ts) forwards the request
server-side to the Worker. Set-Cookie headers flow back through the proxy.

```
Browser
  │
  │ /auth/signin → "Continue with Google"
  ▼
Next.js (Vercel)
  │ rewrites: /api/auth/* → ${NEXT_PUBLIC_GAME_SERVER_HTTP}/api/auth/*
  ▼
Cloudflare Worker
  │ Better Auth handler (drizzleAdapter → env.DB)
  │  • OAuth redirect dance
  │  • Magic-link via Resend REST API
  │  • createUser / linkAccount / createSession via Drizzle
  ▼
D1 (SQLite) — user, session, account, verification
```

Sign-in done → Better Auth sets its session cookie. Cookie applies to the
Vercel origin (because the browser saw the response on that origin).

When the user clicks "Create match" or "Join match":

```
Browser POST /api/ws-token (cookie attached, same Vercel origin)
  │
  ▼
Next.js — rewrites to Worker /api/ws-token
  │
  ▼
Worker /api/ws-token
  │  • createAuth(env).api.getSession({ headers })
  │  • signWsToken(WS_SIGNING_SECRET, { userId, displayName }) — HS256, 5 min
  ▼
Browser stores token in sessionStorage[`coup-online:token:${matchId}`]
  │
  ▼
Browser opens WS → Worker /api/ws?matchId=...&token=...
  │
  ▼
GameRoom DO — verifyJwt() with WS_SIGNING_SECRET; 4001 if invalid
```

SKILL.md § 2 is preserved: D1 only ever talks to the Worker.

---

## Worker-side: `apps/game-server/src/auth.ts`

The factory `createAuth(env)` builds a `betterAuth({...})` instance per
request (Workers expose env on the request boundary).

```ts
export function createAuth(env: Env) {
  const db = createDb(env.DB)
  return betterAuth({
    appName: 'Coup Online',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,       // Vercel origin
    trustedOrigins: [...env.ALLOWED_ORIGINS.split(',')],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification }, // packages/db/src/schema.ts
    }),
    session: {
      cookieCache: { enabled: true, maxAge: 60 }, // skip DB on hot reads
    },
    socialProviders: {
      google: { clientId, clientSecret },
      discord: { clientId, clientSecret },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          // POST Resend REST API directly — no SDK.
        },
      }),
    ],
  })
}
```

The Hono router in [`index.ts`](../apps/game-server/src/index.ts) mounts:

```ts
app.on(['GET', 'POST'], '/api/auth/*', (c) =>
  createAuth(c.env).handler(c.req.raw),
)

app.post('/api/ws-token', async (c) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  })
  if (!session?.user?.id) return c.json({ error: 'unauthorized' }, 401)
  const token = await signWsToken(c.env.WS_SIGNING_SECRET, {
    userId: session.user.id,
    displayName: session.user.name ?? session.user.email?.split('@')[0] ?? 'Player',
  })
  return c.json({ token })
})
```

`wrangler.toml` carries `compatibility_flags = ["nodejs_compat"]` — Better
Auth imports `node:async_hooks` internally; Cloudflare polyfills the subset
we need. Our own code stays on Web Crypto (SKILL.md § 5).

---

## Next.js side: `apps/web/`

Files:

```
apps/web/
  next.config.ts                       rewrites /api/auth/:path* + /api/ws-token → Worker
  lib/auth-client.ts                   createAuthClient (better-auth/react) + magicLinkClient
  lib/get-server-session.ts            Server Component / Route Handler session helper
  app/auth/signin/page.tsx             Three-provider sign-in UI (client component)
  app/page.tsx                         Lobby; useSession from auth-client
  app/room/[matchId]/page.tsx          Server component; getServerSession + redirect
  app/layout.tsx                       No SessionProvider — Better Auth manages its own state
```

No `middleware.ts`, no `auth.ts`, no adapter, no SessionProvider wrapper —
the Better Auth migration deleted all of them. The server-side gate at
`/room/[matchId]/page.tsx` is the canonical no-guest-play enforcement;
the lobby (client component) shows a "sign in" link if `useSession()`
returns no user.

---

## Schema (Better Auth column names)

`packages/db/src/schema.ts`. The four auth tables are exported with
singular names so Better Auth's Drizzle adapter finds them by convention:

| Drizzle export | SQL table | Notes |
|---|---|---|
| `user` | `user` | Adds `displayName` / `mu` / `sigma` for game state. `emailVerified` is **boolean** (Better Auth shape — SQLite 0/1). `name` is NOT NULL (Better Auth requirement). |
| `session` | `session` | NEW. Better Auth's DB-backed session row. |
| `account` | `account` | OAuth links. Columns renamed: `providerId` (was `provider`), `accountId` (was `providerAccountId`), `accessToken`/`refreshToken`/`idToken` camelCase, `accessTokenExpiresAt`/`refreshTokenExpiresAt` timestamps, new `password` for credentials, new synthetic `id` PK. |
| `verification` | `verification` | Renamed from `verificationToken`. `value` was `token`. |

All four tables carry `createdAt` and `updatedAt`. The match/social tables
are unchanged.

See [`db-schema.md`](./db-schema.md) for the full column list.

---

## Provider setup

### Google OAuth

1. Google Cloud Console → APIs & Services → Credentials.
2. Create OAuth client ID, **Web application**.
3. Authorized redirect URIs (must point at the **Vercel** origin, not the
   Worker URL):
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://your-domain.example.com/api/auth/callback/google` (prod)
4. Copy client ID + client secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   **on the Worker** (`wrangler secret put`).

### Discord OAuth

1. Discord Developer Portal → New Application.
2. OAuth2 → Add Redirect:
   - `http://localhost:3000/api/auth/callback/discord` (dev)
   - `https://your-domain.example.com/api/auth/callback/discord` (prod)
3. Copy Client ID + Client Secret → `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
   on the Worker.

### Resend (email magic link)

1. resend.com → create an API key.
2. Verify a domain (e.g., `mail.your-domain.example.com`).
3. `RESEND_API_KEY` = the API key.
4. `RESEND_FROM` = `noreply@mail.your-domain.example.com`.

For initial testing without domain verification, Resend's
`onboarding@resend.dev` sandbox sender works but only delivers to the
account holder's email.

---

## Environment variables

### Cloudflare Worker (where everything auth-related lives)

| Name | Purpose | How to set |
|---|---|---|
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption secret (min 32 chars). `openssl rand -base64 32` | `wrangler secret put BETTER_AUTH_SECRET` |
| `BETTER_AUTH_URL` | Canonical site URL (the Vercel origin), e.g. `https://coup.example.com` | `wrangler secret put BETTER_AUTH_URL` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google provider | `wrangler secret put …` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord provider | `wrangler secret put …` |
| `RESEND_API_KEY` | Resend API key | `wrangler secret put RESEND_API_KEY` |
| `RESEND_FROM` | Verified Resend sender | `wrangler secret put RESEND_FROM` |
| `WS_SIGNING_SECRET` | HS256 secret used by `/api/ws-token` and `GameRoom.verifyJwt` | `wrangler secret put WS_SIGNING_SECRET` |
| `ALLOWED_ORIGINS` | Comma-separated production origins. Doubles as Better Auth's `trustedOrigins` AND the WS upgrade Origin allowlist. | `wrangler secret put ALLOWED_ORIGINS` |

### Vercel (Next.js)

| Name | Purpose | Visibility |
|---|---|---|
| `NEXT_PUBLIC_GAME_SERVER_HTTP` | Worker HTTPS base. Used by the rewrites + the WebSocket client. | public |
| `NEXT_PUBLIC_GAME_SERVER_WS` | Optional explicit `wss://…` override | public |

That's it. **No auth secrets on Vercel** — the Worker is the only thing
that knows how to authenticate users.

Local dev mirrors:
- `apps/web/.env.local` — `NEXT_PUBLIC_GAME_SERVER_HTTP=http://127.0.0.1:8787`
- `apps/game-server/.dev.vars` — every Worker secret listed above

Both files are gitignored.

---

## Notes & gotchas

### Cookie cache and custom session fields

Better Auth's cookie cache skips the DB on hot reads. **Custom session
fields are NOT cached** (per the skill); they're fetched fresh on every
read. We don't add custom fields today, but if we add (e.g.) "current
match" to the session in the future, plan for the DB hit.

### Magic-link expiry

Better Auth's magicLink plugin defaults to a short token expiry (minutes,
not days). The plugin auto-cleans expired verification rows.

### OAuth callback URLs

**Must** point at the Vercel origin, not the Worker URL. Better Auth uses
`BETTER_AUTH_URL` to construct callback URLs that hit Vercel; rewrites
forward the callback to the Worker for handling. Updating Google / Discord
consoles to the Worker URL would skip Vercel and break cookies.

### Cloudflare nodejs_compat

`compatibility_flags = ["nodejs_compat"]` in
[`apps/game-server/wrangler.toml`](../apps/game-server/wrangler.toml). Better
Auth imports `node:async_hooks` internally. Without the flag, the Worker
errors at runtime. Our own code stays Web-Crypto-only per SKILL.md § 5.

### Bundle size

Better Auth + Drizzle adapter pushes the Worker bundle to ~2.8 MB (~485 KB
gzipped). Well under Workers Free's 10 MB cap, but worth noting if more
plugins land.

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 5 (WS auth + Origin + rate limit), § 6 (Persistence layer)
- **WS auth verification on the Worker side:** [`durable-objects.md`](./durable-objects.md#authentication-on-ws-upgrade)
- **D1 schema for the auth tables:** [`db-schema.md`](./db-schema.md)
- **Source — Worker side:** `apps/game-server/src/auth.ts`, `ws-token.ts`, `index.ts`
- **Source — Next.js side:** `apps/web/lib/auth-client.ts`, `lib/get-server-session.ts`, `next.config.ts`, `app/auth/signin/page.tsx`
- **Upstream:** [better-auth.com/docs](https://better-auth.com/docs)
