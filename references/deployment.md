# Deployment

How to take `coup-online` from local repo to a running production game. **All
services on free tiers** per SKILL.md § 2 — no paid services without explicit
approval.

---

## Account prerequisites (one-time, on you)

| Service | Tier | Purpose |
|---|---|---|
| Cloudflare | Free | Workers + D1 + Web Analytics for the game-server + DNS + analytics |
| Vercel | Hobby (free, non-commercial) | Hosts `apps/web` |
| GitHub | Free | Repo `T7SEN/coup-online` + Vercel auto-deploy hook |
| Google Cloud Console | Free | OAuth credentials for Google sign-in |
| Discord Developer Portal | Free | OAuth credentials for Discord sign-in |
| Resend | Free (100 emails/day, 3K/month — verify at resend.com/pricing) | Sender for email magic links |
| Sentry | Free (5K errors/month) | Error reporting on both runtimes |

**Vercel Hobby's commercial-use clause:** the moment you accept money for the
game (donations, ads, in-app purchases — anything), the frontend must migrate
off Hobby (to Cloudflare Pages or Vercel Pro). Plan for the migration before
monetizing; don't accidentally cross the line.

---

## Local development

### One-time setup

```bash
# From repo root
CI=1 pnpm install --no-frozen-lockfile
```

Verify the three gates from the start:

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r build
pnpm --filter @coup-online/game-logic test
```

### Boot the frontend

```bash
pnpm --filter @coup-online/web dev
```

Serves at `http://localhost:3000` via Turbopack.

### Boot the game-server

```bash
pnpm --filter @coup-online/game-server dev
```

Spawns `workerd` (Cloudflare's local Workers runtime) via miniflare. Default
binds at `http://127.0.0.1:8787`. Hit `/health` to smoke-test:

```bash
curl http://127.0.0.1:8787/health
# → {"ok":true}
```

The Worker has access to **local** versions of all bindings:
- 3 Durable Objects (`GAME_ROOM`, `MATCHMAKING_QUEUE`, `ROOM_CODE_REGISTRY`) backed by local SQLite via miniflare
- `DB` (D1 binding) backed by local SQLite

### Local D1

Wrangler auto-creates a local D1 instance for `wrangler dev`. Schema migrations
apply with:

```bash
pnpm --filter @coup-online/game-server exec wrangler d1 migrations apply coup-online-db --local
```

(Run once after generating migrations with `drizzle-kit generate` — once
`packages/db` lands.)

---

## Production deploy — game-server

### Step 1. Authenticate

```bash
pnpm --filter @coup-online/game-server exec wrangler login
# Opens browser. Authorize. Token persists in %USERPROFILE%\.wrangler\.
```

Verify:

```bash
pnpm --filter @coup-online/game-server exec wrangler whoami
```

### Step 2. Create D1 (already done in this project)

```bash
pnpm --filter @coup-online/game-server exec wrangler d1 create coup-online-db
```

Returns a snippet with `database_id`. **The id is committed to `wrangler.toml`.**
It's an identifier, not a secret. The current value lives in the repo's
`apps/game-server/wrangler.toml`.

### Step 3. Apply D1 migrations to production

```bash
pnpm --filter @coup-online/game-server exec wrangler d1 migrations apply coup-online-db --remote
```

Lists pending migrations and applies them to the production D1 instance.

### Step 4. Set Worker secrets

The Worker needs runtime secrets that aren't committed:

```bash
# SKILL.md § 5 — HS256 secret used to sign + verify WS-upgrade JWTs.
# Both endpoints live on the Worker now (sign in /api/ws-token, verify in
# the GameRoom DO), so this no longer needs to be shared with Vercel.
pnpm --filter @coup-online/game-server exec wrangler secret put WS_SIGNING_SECRET

# Better Auth core (see references/auth.md).
pnpm --filter @coup-online/game-server exec wrangler secret put BETTER_AUTH_SECRET    # openssl rand -base64 32
pnpm --filter @coup-online/game-server exec wrangler secret put BETTER_AUTH_URL       # https://coup.example.com (the Vercel origin)

# OAuth provider credentials.
pnpm --filter @coup-online/game-server exec wrangler secret put GOOGLE_CLIENT_ID
pnpm --filter @coup-online/game-server exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm --filter @coup-online/game-server exec wrangler secret put DISCORD_CLIENT_ID
pnpm --filter @coup-online/game-server exec wrangler secret put DISCORD_CLIENT_SECRET

# Resend (magic-link plugin sends via Resend REST).
pnpm --filter @coup-online/game-server exec wrangler secret put RESEND_API_KEY
pnpm --filter @coup-online/game-server exec wrangler secret put RESEND_FROM            # noreply@your-domain.example.com

# Origin allowlist (comma-separated). REQUIRED in production — unset = dev
# mode, which permissively matches localhost + RFC 1918 private network IPs.
# Doubles as Better Auth's trustedOrigins.
pnpm --filter @coup-online/game-server exec wrangler secret put ALLOWED_ORIGINS
# Value example: "https://coup.example.com,https://www.coup.example.com"

# Sentry DSN for the cloudflare worker.
pnpm --filter @coup-online/game-server exec wrangler secret put SENTRY_DSN_WORKER
```

Wrangler prompts for the value, stores it as a Workers secret, never echoes
it back. Set the same `WS_SIGNING_SECRET` value on the Next.js side (Vercel
env vars).

### Step 5. Deploy

```bash
pnpm --filter @coup-online/game-server deploy
```

This runs `wrangler deploy`. Wrangler bundles the Worker, uploads it, registers
the DOs, and prints the public URL (e.g., `coup-online-game-server.<your-account>.workers.dev`).

### Step 6. (Optional) Custom domain

For a stable WebSocket endpoint:

1. Add a Worker route in `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "ws.coup.example.com/*", custom_domain = true }
   ]
   ```
2. Add a `CNAME` in Cloudflare DNS pointing `ws.coup.example.com` → the
   workers.dev URL (or use `custom_domain = true` which auto-configures).
3. Re-deploy.

Custom domains on Workers are free.

---

## Production deploy — web

### Step 1. Create a Vercel project

1. Log in at https://vercel.com.
2. Import the `T7SEN/coup-online` repo.
3. Vercel auto-detects Next.js. **Root directory** must be `apps/web`.
4. Build command: `pnpm --filter @coup-online/web build` (or override).
   Since this is a pnpm monorepo, also set:
   - Install command: `CI=1 pnpm install --no-frozen-lockfile`
   - Or in Vercel project settings: enable "Auto" detection for pnpm; let
     Vercel handle it.

### Step 2. Set Vercel environment variables

In Vercel project settings → Environment Variables. **The `example.com` URLs below are
illustrative — RFC 2606 reserved-for-documentation domains. Substitute your actual
production domain (Vercel-assigned `*.vercel.app` initially; custom domain after DNS setup).**

**No auth secrets on Vercel.** Better Auth runs on the Worker (see
references/auth.md), so Vercel only needs the public game-server URL. The
`/api/auth/*` and `/api/ws-token` routes are rewritten to the Worker via
[`apps/web/next.config.ts`](../apps/web/next.config.ts).

| Name | Value source | Scope |
|---|---|---|
| `NEXT_PUBLIC_GAME_SERVER_HTTP` | `https://ws.coup.example.com` — public Worker URL (browser uses; WS URL derived; rewrites use this too) | Production, Preview |
| `NEXT_PUBLIC_GAME_SERVER_WS` | Optional explicit `wss://…` override (browser) | Production, Preview |
| `NEXT_PUBLIC_SENTRY_DSN` | From Sentry | Production, Preview |
| `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | From Cloudflare Web Analytics | Production |

**Public vs server-side:** `NEXT_PUBLIC_*` vars ship to the browser. Anything
sensitive (secrets, internal URLs that bypass auth) must NOT be prefixed.

### Step 3. Deploy

Push to `main`. Vercel auto-deploys. Verify:

```bash
curl -I https://your-domain.example.com
# Expect 200 OK
```

### Step 4. Configure Cloudflare Web Analytics

1. In Cloudflare dashboard → Web Analytics → Add a site.
2. Use the **non-Cloudflare** track flow (since Vercel hosts the site).
3. Copy the beacon script token; add to `apps/web/app/layout.tsx`:

   ```tsx
   <Script
     defer
     src="https://static.cloudflareinsights.com/beacon.min.js"
     data-cf-beacon={`{"token": "${process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN}"}`}
   />
   ```

Free, no event cap, no NPM package.

---

## Secrets management

| Secret | Where it's set | Used by |
|---|---|---|
| `WS_SIGNING_SECRET` | Worker secret | Signs WS JWTs in `/api/ws-token` + verifies in GameRoom DO |
| `BETTER_AUTH_SECRET` | Worker secret | Better Auth cookie / token signing |
| `BETTER_AUTH_URL` | Worker secret | Canonical site URL (Vercel origin) — Better Auth uses for callback URLs |
| `GOOGLE_CLIENT_ID/SECRET` | Worker secret | Better Auth Google provider |
| `DISCORD_CLIENT_ID/SECRET` | Worker secret | Better Auth Discord provider |
| `RESEND_API_KEY` | Worker secret | Better Auth magic-link plugin |
| `RESEND_FROM` | Worker secret | Magic-link from-address |
| `ALLOWED_ORIGINS` | Worker secret | Origin allowlist + Better Auth trustedOrigins |
| `SENTRY_DSN_WORKER` | Worker secret | `@sentry/cloudflare` |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel env (note: public — Sentry DSNs are designed to be public) | `@sentry/nextjs` |
| `database_id` | `wrangler.toml` (committed — not a secret) | D1 binding |

**Never commit any of the secrets above to the repo.** `.env.local` is in
`.gitignore`; `.dev.vars` (wrangler local secrets) is gitignored too.

### Local dev secrets

For local dev:

- Next.js: create `apps/web/.env.local` with the same vars. Vercel doesn't
  read this; it's purely for `pnpm --filter @coup-online/web dev`.
- Worker: create `apps/game-server/.dev.vars` with **every Worker secret
  listed above** (`WS_SIGNING_SECRET`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL=http://localhost:3000`, OAuth IDs/secrets,
  `RESEND_API_KEY`, `RESEND_FROM`, `ALLOWED_ORIGINS`, optionally
  `SENTRY_DSN_WORKER`). Wrangler reads this in `wrangler dev`.

Both files are gitignored (per root `.gitignore`).

---

## Observability — Sentry + Cloudflare Web Analytics

SKILL.md § 5 — error monitoring on both runtimes. SKILL.md § 2 — Cloudflare
Web Analytics (never Vercel Analytics).

### Sentry

| Runtime | Package | Wiring |
|---|---|---|
| Worker | `@sentry/cloudflare` | `Sentry.withSentry()` wraps the default export; `Sentry.instrumentDurableObjectWithSentry()` wraps each of the 3 DO classes (`apps/game-server/src/index.ts`). The `captureError` helper in `do-game-room.ts` reports DO errors tagged with `matchId`. |
| Web | `@sentry/nextjs` | `instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `app/global-error.tsx`; `next.config.ts` wrapped in `withSentryConfig`. |

Enabled features:
- **Error monitoring** — always on, both runtimes.
- **Performance Monitoring (tracing)** — `tracesSampleRate` 1.0 dev / 0.1
  prod, both runtimes.
- **Structured Logs** — `enableLogs: true` on web (client/server/edge) and
  the Worker. Application code logs through the `logger` utility
  (`apps/web/lib/logger.ts`, `apps/game-server/src/logger.ts`), which calls
  `Sentry.logger.*` and — for `logger.error(msg, err)` — also opens an Issue.
  SKILL.md § 5 forbids raw `console.*` at call sites; the logger module is
  the one sanctioned place for it.
- **Metrics** — on by default in SDK ≥ 10.25 (project is on 10.53). No init
  flag exists; only `enableMetrics: false` would disable. No `Sentry.metrics.*`
  instrumentation calls yet — added when there's a metric worth tracking.
- **Session Replay** — web only (browser-only by nature). `replayIntegration()`
  with all text / inputs / media masked (SKILL.md § 3.6). Error-biased
  sampling: `replaysOnErrorSampleRate: 1.0`, `replaysSessionSampleRate: 0.01`
  — the free-tier replay quota is small, so spend it on sessions that broke.
- **User Feedback** — web only. `feedbackIntegration()` floating widget.

Other config:
- **`sendDefaultPii: false`** — user IPs are not shipped to Sentry
  (SKILL.md § 3.6 — minimal PII).
- DSNs are optional: when unset the SDK initializes disabled and every
  capture no-ops, so local dev and un-configured deploys run clean.

Source-map upload (un-minified stack traces) is optional — set `SENTRY_ORG`,
`SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in Vercel env to enable it. Without
them `withSentryConfig` skips upload; runtime error capture still works.
`@sentry/cli` (pulled in for source-map upload) has a postinstall that
downloads a binary — allowlisted in `pnpm-workspace.yaml`'s `allowBuilds`.

### Cloudflare Web Analytics

A beacon `<Script>` in `apps/web/app/layout.tsx`, rendered only when
`NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` is set. Get the token from the
Cloudflare dashboard → Web Analytics → add a site (use the non-Cloudflare
flow since Vercel hosts the frontend). Free, no event cap, no npm package.

---

## Free-tier limits — what to watch

| Resource | Free limit | What overruns look like |
|---|---|---|
| Cloudflare Workers | 100K req/day | 429s, then upgrade prompt |
| DO compute time | Charged per **active second** — Hibernation API drops to zero between messages | Bills if a DO leaks `accept()` (use `acceptWebSocket()` always) |
| DO storage | 5 GB SQLite included | Capped reads/writes well before |
| D1 | 5 GB / 5M reads-per-day / 100K writes-per-day | 429s; data preserved |
| Cloudflare Web Analytics | Unlimited events | None |
| Vercel Hobby bandwidth | 100 GB/month outbound | Throttling on overage |
| Vercel Hobby function executions | 100K serverless function invocations/month | 429s |
| Sentry | 5K errors/month total | Errors dropped past quota |
| Resend | 100 emails/day, 3K/month (verify current limits) | 429 on sending |

**Monitoring:**
- Cloudflare dashboard → Workers & Pages → your worker → Metrics tab (request count, DO duration)
- Vercel dashboard → Project → Usage
- Sentry alert when quota nears 80%

---

## Deployment checklist (smoke test after first prod deploy)

1. Visit the web URL → root page renders.
2. `/api/auth/signin` → providers listed (Google, Discord, magic link).
3. Sign in via Google or Discord.
4. From the browser console (signed-in tab): fetch `/api/ws-token` → returns
   `{ token: "..." }`.
5. Open `wss://<ws-domain>/?token=<that-token>` from devtools console; expect
   a successful WebSocket connection.
6. From Cloudflare dashboard, observe a real-time uptick on the worker's
   request count.
7. From Vercel dashboard, observe one function invocation for the token fetch.

---

## Rollback

### Frontend (Vercel)
Vercel auto-keeps every deployment. To rollback: dashboard → Deployments →
pick a green one → "Promote to Production".

### Game-server (Cloudflare Workers)
Workers keep the last few uploads. To rollback:

```bash
pnpm --filter @coup-online/game-server exec wrangler rollback
```

Lists prior versions; pick one. Note: rolling back a Worker does NOT roll back
DO storage or D1 — those persist independently. If a schema change is at fault,
you'll also need to revert the D1 migration with a new corrective migration
(never edit a shipped one — see SKILL.md § 5).

---

## Monetization migration (when v2 happens)

When the project starts taking money:

1. **Move frontend off Vercel Hobby** to either:
   - Vercel Pro (~$20/mo per member) — same workflow, just paid.
   - Cloudflare Pages (free, commercial-use OK). Switch the GitHub Actions
     pipeline to `wrangler pages deploy` and update DNS to point at Pages.
2. **Re-audit free-tier services** for commercial-use clauses:
   - Resend's free tier is commercial-OK.
   - Sentry Free is commercial-OK.
   - Cloudflare Workers Free is commercial-OK; only the request quota is the
     concern. Workers Paid ($5/mo) bumps to 10M req/mo + better DO limits.
3. **Add Terms of Service + Privacy Policy** to the frontend.
4. **Set up Stripe** for the payment surface (out of v1 scope; standard
   integration pattern).

---

## See also

- **Canonical spec for the locked stack and free-tier posture:** [`SKILL.md`](../SKILL.md) § 2 (Tech Stack — Locked Versions), § 0 step 9 (free-tier check), § 1 (cost posture)
- **WS auth issuance + verification code (the `WS_SIGNING_SECRET` flow):** [`coding-patterns.md`](./coding-patterns.md) § 17
- **Why each free-tier service was chosen (D1 over Neon, Cloudflare Web Analytics over Vercel, etc.):** [`anti-hallucination.md`](./anti-hallucination.md)
- **Cloudflare Worker + DO architecture for game-server:** [`SKILL.md`](../SKILL.md) § 3.3 (Durable Object Per Room), § 3.4 (Matchmaking)
- **Frontend hosting constraints (Vercel Hobby's commercial-use clause):** [`SKILL.md`](../SKILL.md) § 2 and the "Monetization migration" section above
- **Refusal trigger for paid services:** [`refusal-catalog.md`](./refusal-catalog.md) — "Introduce a paid-tier service"
