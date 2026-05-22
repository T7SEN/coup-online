# Launch Checklist — v1

Pre-launch runbook. Work top-to-bottom. Tick each item before tagging `v1.0`
and announcing.

This file is reusable for future major version launches — clone the relevant
sections into a v2 checklist when the time comes.

---

## 0. State of v1 scope (for reference)

**Ships in v1:**
- Sign-in: Google + Discord + magic link + passkey
- 2FA: TOTP + email OTP + backup codes, working on every sign-in method
- Private rooms (6-char base32 codes), 3–6 player matches
- TrueSkill rating, leaderboard, profile, match history, match summary
- Patron storefront (all 12 cosmetics) + admin grant/revoke + audit log
- R2 avatars + banners, settings, account deletion (anonymization)
- Sentry on both ends, Cloudflare Web Analytics, rate limiting

**Deferred to v2:**
- **Public matchmaking** — `MatchmakingQueue` DO is a stub returning 501.
  Play hub shows "Coming in v2". SKILL.md § 3.4.
- **Friends** — schema (`friend`, `friend_request`) is ready; no UI.
- **Cloudflare edge hardening** (HSTS, Bot Fight, WAF managed rules) —
  dashboard config; see § 8 for the walk-through. Recommended day-one but
  not blocking.
- ESLint 10 (blocked on `eslint-plugin-react@8` stable).

**Shipped after the initial scope was written (no longer deferred):**
- Content-Security-Policy header — production-only, locked-down
  connect-src + strict frame-ancestors/object-src/base-uri/form-action. See
  `apps/web/next.config.ts`.
- Renovate dependency-update automation — config at `.github/renovate.json`.
  Install instructions in § 9.

---

## 1. End-to-end gameplay verification

Game-logic has 314 unit tests, but real WebSocket round-trips, real D1 writes,
and real disconnect/reconnect timing have never been exercised at scale.
Required:

### 1a. Three-player happy path
- [ ] Three browser sessions (you + 2 friends, or 2 alt accounts in incognito
      tabs from different IPs ideally so rate-limit can't trip).
- [ ] Host creates a private room from `/play` → "Create match" → URL becomes
      `/room/<code>`.
- [ ] Hosts shares the code; both joiners paste it in `/play` → "Join match".
- [ ] Host clicks "Start game".
- [ ] Play one full round — exercise at minimum: Income, Foreign Aid, Tax,
      Steal, Coup at 7+ coins, an Assassinate that gets blocked by Contessa.
- [ ] One challenge per player (one proven, one disproven) — verify the loser's
      InfluencePick prompt shows only that player both their cards.
- [ ] Verify the per-player slicing: each browser's DevTools Network tab
      shows the WS frames; the `state-update` to player A must NOT contain
      face-down card kinds for players B/C (only `{status:"hidden"}` tokens).
- [ ] Game ends → match summary page renders with rating deltas.
- [ ] All three players see updated TrueSkill on the leaderboard.

### 1b. Reconnection grace
- [ ] During an active game, close one player's browser tab mid-turn.
- [ ] Other players see them marked `isDisconnected: true`.
- [ ] If it's the disconnected player's turn, action timer pauses.
- [ ] Within 30s, the same player opens `/room/<code>` again. Should reattach
      to the same seat with full state replayed.
- [ ] Wait past 30s with the tab closed. Server auto-forfeits — both their
      influence cards flip face-up, they're eliminated, game continues.

### 1c. Simultaneous challenge race
- [ ] Set up a 3-player game where two players will both challenge.
- [ ] Have the two other players click "Challenge" at roughly the same moment
      (Discord call coordination is easier than perfect timing).
- [ ] Exactly one challenge resolves; the other is silently dropped (per
      SKILL.md § 3.2 — first server-received challenge wins by DO `Date.now()`).
- [ ] No errors in either client; both browsers receive the same final
      `state-update` reflecting one challenge resolution.

### 1d. Mandatory Coup at 10 coins
- [ ] In a private 3-player room, the host plays cooperatively to feed one
      player coins past 10 (Tax repeatedly to accumulate; have others let them).
- [ ] At ≥10 coins, that player's action menu must show ONLY Coup. All other
      action buttons are disabled with a tooltip explaining the mandatory rule
      (per SKILL.md § 4.9).
- [ ] Server enforces independently — attempt to send `{type:"action", action:
      {kind:"Income"}}` from the browser DevTools console; server rejects.

### 1e. Ambassador exchange privacy
- [ ] Play through to an Exchange action. The acting player sees a 4-card pool
      (their 2 + 2 drawn).
- [ ] DevTools → Network → check the `prompt` message sent to the actor. ONLY
      that player receives it. The 4-card pool MUST NOT appear in any other
      player's WS frames.
- [ ] Attempt fabricated returns from DevTools — send `{type:"exchange-pick",
      keepIndices:[7,8]}` (invalid indices). Server rejects with an error.

### 1f. 2FA + passkey end-to-end
- [ ] Sign out. Sign in via Google. Land on `/auth/two-factor` (because you
      have 2FA enabled). Enter TOTP → land on home page signed in.
- [ ] Same flow with Discord.
- [ ] Same flow with magic link.
- [ ] Sign out. Sign in via passkey. Skip 2FA challenge (correct — passkey IS
      multi-factor). Land on home page signed in.
- [ ] In Settings → Passkeys, add a second passkey. Verify list shows both.
      Delete one. Verify list updates.
- [ ] 2FA challenge page: try each of the three methods (Authenticator code /
      Email code / Backup code). All three should succeed.

---

## 2. Production credentials & integrations

### 2a. OAuth callback URLs

**Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)
→ APIs & Services → Credentials → your OAuth 2.0 Client ID):

Authorized redirect URIs must include both:
- `https://coups.app/api/auth/callback/google` — production
- `http://localhost:3000/api/auth/callback/google` — dev

Authorized JavaScript origins:
- `https://coups.app`
- `http://localhost:3000`

**Discord Developer Portal** ([discord.com/developers/applications](https://discord.com/developers/applications)
→ your app → OAuth2 → Redirects):

- `https://coups.app/api/auth/callback/discord`
- `http://localhost:3000/api/auth/callback/discord`

Verify by going through the OAuth round-trip from the production site in
incognito (no cached session). A misconfigured redirect URI shows up as a
Google/Discord-side error page ("redirect_uri_mismatch") before Better Auth
sees the callback.

### 2b. Resend domain verification — **t7sen.com**

Magic link + 2FA email OTP both send via Resend. Production sends as **`Coup
Online <noreply@t7sen.com>`** — the From-domain (`t7sen.com`) is separate
from the app domain (`coups.app`) so app-domain DNS stays free of email
records. The brand mismatch is mitigated three ways: display-name From, every
link in the body points to coups.app, and the email footer reads "Sent via
t7sen.com on behalf of Coup Online" so recipients who check have an honest
answer. Email templates live in `apps/game-server/src/emails.ts`.

Without verification, mail routes through Resend's shared `resend.dev`
address → flagged as spam by most major inboxes, low open rates, some
corporate inboxes reject outright.

Pre-flight — confirm what's already on t7sen.com:

```powershell
nslookup -type=TXT t7sen.com
nslookup -type=MX t7sen.com
nslookup -type=TXT _dmarc.t7sen.com
```

Watch for: existing apex SPF (must merge, not duplicate — Resend uses a
`send.` subdomain so the apex typically stays untouched), existing DKIM
selectors (coexist with Resend's `resend._domainkey`), existing apex MX
(Resend's MX goes on `send.t7sen.com`, no collision), existing DMARC
(relaxed mode `adkim=r aspf=r` is required for subdomain alignment).

Steps:

1. [Resend dashboard](https://resend.com/domains) → **Add Domain** →
   enter `t7sen.com`. Pick the region closest to your audience.

2. Add the DNS records Resend lists at **t7sen.com's DNS provider**:
   - `send` (TXT) — SPF for the bounce subdomain
   - `send` (MX) — bounce handling
   - `resend._domainkey` (TXT) — DKIM signing key
   - `_dmarc` (TXT) — optional but recommended, start with `p=none`

   On Cloudflare: every record MUST be set to **"DNS only" (grey cloud)**,
   not proxied (orange cloud). The orange cloud only handles HTTP/HTTPS and
   silently breaks SMTP, DKIM, SPF lookups.

3. Wait 5–60 minutes for propagation. Resend shows green checks per row
   when each is readable; domain status flips `pending` → **`verified`**.

4. Confirm `RESEND_FROM` on the Worker uses an address at `t7sen.com`,
   with the display-name format so inboxes show "Coup Online" as the sender:

   ```powershell
   pnpm --filter @coup-online/game-server exec wrangler secret put RESEND_FROM
   ```

   Paste exactly: `Coup Online <noreply@t7sen.com>`

   Secrets propagate within ~30 seconds; no redeploy needed.

5. Smoke-test: request a magic link from `/auth/signin`. Email arrives
   within a minute. From: shows "Coup Online" (raw address only visible if
   you tap the sender name). Gmail → open → **⋮** → **Show original**:
   ```
   DKIM: PASS with domain t7sen.com
   SPF:  PASS with domain t7sen.com
   DMARC: PASS (if DMARC is set)
   ```

6. Repeat for 2FA email-OTP: sign out, sign in via Google, on the 2FA
   challenge page tap **Email** → **Send code**. Same headers pass.

### 2c. Worker secrets

Run `wrangler secret list` and confirm ALL of these are present (it shows
names, not values — that's intentional):

- [ ] `BETTER_AUTH_URL` = `https://coups.app/api/auth` (the `/api/auth`
      suffix matters — without it, plugin endpoints 404 silently because
      Better Auth's basePath becomes `/` and the router won't strip
      `/api/auth` from incoming URLs)
- [ ] `BETTER_AUTH_SECRET` (≥ 32 random chars)
- [ ] `WS_SIGNING_SECRET` (≥ 32 random chars)
- [ ] `ALLOWED_ORIGINS` = `https://coups.app` (CSV if multiple origins)
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- [ ] `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
- [ ] `RESEND_API_KEY` / `RESEND_FROM`
- [ ] `SENTRY_DSN_WORKER`

If any are missing, set with `wrangler secret put <NAME>` (interactive
prompt).

### 2d. Vercel env vars

Vercel dashboard → coup-online-web → Settings → Environment Variables, scoped
to Production:

- [ ] `NEXT_PUBLIC_GAME_SERVER_HTTP` = `https://coup-online-game-server.a-hitelare2.workers.dev`
- [ ] `NEXT_PUBLIC_SENTRY_DSN`
- [ ] `SENTRY_AUTH_TOKEN` (for source-map upload at build time)
- [ ] `SENTRY_ORG` / `SENTRY_PROJECT`
- [ ] `NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN`

`NEXT_PUBLIC_SENTRY_RELEASE` does NOT need to be set explicitly — Vercel
auto-injects `VERCEL_GIT_COMMIT_SHA` and our `next.config.ts::env` bridges
it.

---

## 3. Operational readiness

### 3a. Sentry alerts
Free tier has 5K errors/month shared between web + Worker. Set up alerts so
you actually find out when something breaks:

- [ ] Sentry → coup-online-web project → Alerts → New Alert: "Issue is first
      seen" → email yourself.
- [ ] Same for coup-online-game-server (Worker) project.
- [ ] Optional: error rate spike alert (e.g., > 50 errors in 5 minutes).

### 3b. Cloudflare Web Analytics
- [ ] Cloudflare dashboard → Analytics → Web Analytics → confirm `coups.app`
      shows traffic after first deploy.
- [ ] Verify the beacon script is loading: DevTools → Network → filter
      `cloudflareinsights` — should see one request per page load.

### 3c. Health endpoint
- [ ] `curl https://coup-online-game-server.a-hitelare2.workers.dev/health`
      returns `{"ok":true}`.
- [ ] Optional: hook up a free uptime monitor (UptimeRobot, Better Stack) to
      ping `/health` every 5 minutes. Notifies you before users notice.

### 3d. R2 bucket
- [ ] `wrangler r2 bucket list` shows `coup-online-avatars`.
- [ ] Upload one test avatar end-to-end via the production Settings page;
      verify it serves back from `/api/avatars/<userId>`.

### 3e. D1 migration state
- [ ] `wrangler d1 migrations list coup-online-db --remote` shows zero pending
      migrations.

---

## 4. Mobile / 360px verification

Code audit found no structural responsive bugs — all layouts use proper
collapse patterns (`grid-cols-2 sm:grid-cols-4`, `flex-wrap`,
`max-w-[X vw]`, `min-w-0` on truncated children). But code audits don't
catch real-device issues. Required:

- [ ] Chrome DevTools → Device Mode → iPhone SE (375px) and one Android-class
      360px viewport. Walk every page from a signed-in session:
  - [ ] Home, About, Rules, Support, Privacy, Terms, Changelog
  - [ ] Sign-in (popup AND full page)
  - [ ] Settings (every card — Account, Profile link, 2FA, Passkeys,
        Patronage, Session, Danger)
  - [ ] Profile (own + someone else's)
  - [ ] Match history page
  - [ ] Leaderboard (with search)
  - [ ] Hall of Patrons
  - [ ] Match summary page
  - [ ] Admin (signed in as admin)
  - [ ] Play hub
  - [ ] **Room/game UI** — most complex layout. Confirm action bar wraps,
        Select target dropdown works, seat cards readable, prompts (challenge,
        block, influence-pick, exchange) all fit
- [ ] On an actual phone (not just devtools), open `coups.app` and walk the
      same flows. Touch targets ≥ 44px (most are, but verify the small
      icon-only buttons like Passkey delete).
- [ ] Card animations don't drop frames on a mid-range Android — flip GSAP
      animations off (`MOTION_ENABLED = false` in `components/motion.tsx`) if
      they do, and ship static for v1.

---

## 5. Pre-launch sanity

- [ ] `pnpm -r typecheck && pnpm -r lint && pnpm -r build` from a clean clone
      all pass on `main`.
- [ ] `pnpm --filter @coup-online/game-logic test` — 314 tests pass.
- [ ] No `console.log` in source (logger utility everywhere).
- [ ] No TODO/FIXME/XXX comments referring to blocking work — `git grep -n
      "TODO\\|FIXME\\|XXX" -- "*.ts" "*.tsx"` shows only acceptable backlog.
- [ ] `pnpm -r audit` — the 2 high `mathjs` advisories via `ts-trueskill`
      are accepted (reachability = 0); no NEW advisories.

---

## 6. Launch

- [ ] Tag the release: `git tag v1.0.0 && git push origin v1.0.0`.
- [ ] Deploy web: push to `main` → Vercel auto-deploys, OR
      `pnpm --filter @coup-online/web build && vercel deploy --prod`.
- [ ] Deploy Worker: `pnpm --filter @coup-online/game-server run deploy`.
- [ ] Smoke-test the production URLs one more time (sign-in, create room,
      play a quick game).
- [ ] Watch Sentry for the first hour — first-hour error rate tells you what
      slipped through the QA pass.

---

## 7. First-week monitoring

- [ ] Daily: Sentry issue triage. Anything new gets root-caused or filed.
- [ ] Daily: Cloudflare Web Analytics — traffic shape, page views, top
      pages, referrers.
- [ ] Weekly: free-tier usage check (Worker requests, D1 reads/writes, R2
      storage, Sentry error count, Resend send count). Confirm no surprise
      headroom problems before they become billing problems.

---

## 8. Cloudflare edge hardening (recommended day-one)

Dashboard config only — no code. The header set in `next.config.ts`
(nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP)
covers the application layer; this section covers Cloudflare's edge so
traffic is filtered before it reaches Vercel or the Worker.

**Scope note:** all settings below apply to the **coups.app** zone (the
Vercel-served frontend). The game WebSocket connects directly to
`coup-online-game-server.a-hitelare2.workers.dev` — Cloudflare's own
shared workers.dev zone, not yours — so WAF/Bot rules on coups.app don't
filter WS traffic. (That's fine: the Worker enforces its own Origin
allowlist + rate limiting on every upgrade.)

**Prerequisite:** coups.app DNS must be on Cloudflare nameservers (NOT the
registrar's default at name.com). See § 8-pre below if you haven't done
the nameserver swap. Domain registration stays at name.com — only the
nameservers change.

**Menu navigation note (Cloudflare reorgs this dashboard yearly):** as of
this writing the Security sidebar contains: Overview, Analytics, Events,
WAF, Client-side security, Bots, API Shield, DDoS, Settings. Page Shield
was renamed to "Client-side security." Page paths below reflect this
layout — if Cloudflare reshuffles again, search by feature name (Ctrl+K
in the dashboard) rather than the path.

### 8-pre. DNS on Cloudflare (one-time)
Required for everything else in § 8 to do anything. Domain registration
stays at name.com (or wherever the domain is registered); only the
nameservers move.

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **+ Add a site** →
   `coups.app` → Free plan
2. Cloudflare imports records from name.com's public DNS. Review:
   - Apex A/AAAA/CNAME → Vercel (whatever name.com had)
   - `www` CNAME → coups.app
   - Any TXT records (Vercel domain verification, Google Search Console)
3. Orange-cloud (proxy ON) the apex + www records. Grey-cloud TXT/MX.
4. Copy the 2 nameservers Cloudflare assigns (e.g. `kara.ns.cloudflare.com`).
5. At name.com → coups.app → **Nameservers** → replace with Cloudflare's two.
   **Don't use name.com's "Transfer Domain" UI** — that's a registrar
   transfer (blocked by ICANN's 60-day lock after recent changes). We're
   only changing nameservers, which is unrestricted.
6. Wait 5–60 min for propagation. Cloudflare status flips Pending → Active.
7. Verify: `nslookup -type=NS coups.app` returns Cloudflare's nameservers,
   and `curl -I https://coups.app` shows `server: cloudflare` + `cf-ray`.

### 8a. SSL/TLS → Overview
- **SSL/TLS encryption mode**: **Full (strict)** — encrypts and validates
  Cloudflare↔Vercel. Other modes either skip encryption ("Flexible" —
  vulnerable to downgrade) or skip cert validation ("Full" — vulnerable to
  MITM at origin). Vercel auto-provisions Let's Encrypt for coups.app so
  strict will work.

### 8b. SSL/TLS → Edge Certificates
- **Always Use HTTPS**: **ON** (auto-redirect http://→https:// at edge)
- **HTTP Strict Transport Security (HSTS)**: **Enable HSTS**
  - **Max-Age**: 6 months (bump to 12 after a week of no issues — don't
    start at 12, browsers cache the policy and you can't unstick them)
  - **Apply HSTS policy to subdomains (includeSubDomains)**: ON
  - **Preload**: OFF (one-way door — submission to the HSTS Preload list
    takes months to remove; defer until you've been stable 6+ months)
  - **No-Sniff Header**: OFF (we set X-Content-Type-Options at origin)
- **Minimum TLS Version**: **TLS 1.2** (1.0/1.1 deprecated since 2020)
- **Opportunistic Encryption**: **ON**
- **TLS 1.3**: **ON**
- **Automatic HTTPS Rewrites**: **ON** (rewrites accidental http:// links
  in HTML/CSS to https://, prevents mixed-content blocks)
- **Certificate Transparency Monitoring**: **ON** (alerts if anyone issues
  a cert for coups.app — rogue-issuance signal)

### 8c. Security → Settings
- **Security Level**: **Medium** (default). High challenges too many legit
  users; Low effectively disables.
- **Challenge Passage**: 30 minutes (default fine)
- **Browser Integrity Check**: **ON**. Blocks no-User-Agent + known-bad UA
  strings. Zero false-positive risk for browsers.
- **Privacy Pass Support**: **ON**. Lets Tor / Privacy Pass token holders
  skip challenges they've already passed elsewhere.
- **Replace insecure JavaScript libraries**: **ON** if shown (we don't ship
  jQuery but no downside).

### 8d. Security → Bots
- **Bot Fight Mode**: **ON**
- Super Bot Fight Mode is Pro+; skip.
- Watch Sentry / user reports for the first week — corporate VPNs and
  shared mobile IPs occasionally get challenged. If a real user reports a
  block, find their event in Security → Events and add a WAF allowlist
  rule for their pattern.

### 8e. Security → WAF
WAF is its own sidebar item with tabs at the top (Managed rules, Custom
rules, Rate limiting rules, Tools).
- **Managed rules** tab → **Cloudflare Free Managed Ruleset** →
  **Deploy** / **Enable**:
  - Action: **Managed Challenge** (JS challenge; most users pass invisibly)
  - Sensitivity: **Medium**
- **Custom rules** tab: free tier allows 5. Optional adds:
  - Block requests to `/api/*` with empty User-Agent
  - Managed Challenge bursts on `/api/auth/sign-in/*` when
    `cf.threat_score > 10`
  These are belt-and-braces on top of our Worker-side rate limiting + Better
  Auth's customRules. Skip if you'd rather keep slots free for future
  tuning.
- **Rate limiting rules** tab: **skip on Free** (10K req/day across all
  rules is too tight; our Worker `RateLimitRegistry` DO is more granular)
- **Tools** tab (if present): User Agent Blocking, IP Access Rules. Both
  free. Don't configure preemptively — use as reactive mitigation when you
  spot abuse in Security → Events.

### 8f. Security → Client-side security (was "Page Shield")
- **Client-side security** → **Settings** tab → toggle **ON**
- The **Scripts** and **Connections** tabs give visibility into what runs
  on your pages once traffic accrues — complements the CSP in
  `next.config.ts` (CSP enforces blocks at the browser; this gives you
  Cloudflare's edge-side view of what's loading).
- Alerts / enforcement features are Pro+; the visibility alone is worth
  the toggle on Free.

### 8g. Security → DDoS
- **DDoS** is now its own top-level sidebar item (was buried under WAF
  before the reorg).
- **HTTP DDoS Attack Protection**: deploy if not auto-on, sensitivity
  **High** (defaults are fine — Cloudflare's auto-mitigation is one of the
  strongest things they ship)
- **Network-layer DDoS Attack Protection**: auto-on, no config
- Tune sensitivity only if you see false positives in Security → Events

### 8g-skip. Security → API Shield
- **Skip.** Cloudflare pushes it hard in 2026 but the useful features
  (schema validation, abuse detection, sequence analysis) are paid. Free
  tier shows you a list of detected endpoints, that's it. Our Worker
  already Zod-validates every request at the boundary.

### 8h. Scrape Shield
- **Email Address Obfuscation**: **ON** (auto-obscures emails in HTML to
  defeat scrapers; no user downside)
- **Server-Side Excludes**: **OFF** (we have no content to selectively
  hide from suspicious visitors)
- **Hotlink Protection**: **OFF** (avatars are served from the Worker
  domain, not coups.app — hotlinking isn't a vector we care about)

### 8i. Network
- **HTTP/3 (with QUIC)**: **ON** (faster + UDP-based, harder to throttle)
- **0-RTT Connection Resumption**: **ON** (saves 1 round-trip for repeat
  visitors)
- **HTTP/2**: ON (default)
- **IPv6 Compatibility**: ON (default)
- **WebSockets**: **verify ON**. Doesn't affect game WS (that hits
  workers.dev directly), but covers any future scenario where WS goes
  through coups.app.
- **gRPC**: OFF (unused)
- **Onion Routing**: OFF initially (nice-to-have privacy gesture for Tor
  users; add later if there's demand)
- **Pseudo IPv4**: OFF (legacy compat, unneeded)

### 8j. Analytics → Security Events (not a setting — monitoring habit)
After enabling all of the above:
- **Daily for the first week**: skim Security → Events. Look for legit-
  looking IPs being challenged repeatedly (= real users being blocked).
  For each: drill in, copy the `cf-ray`, add a WAF custom rule to soften
  whichever managed rule tripped.
- **Daily for the first week**: look for actual attack patterns (e.g.,
  POST `/api/auth/sign-in/magic-link` flood from one ASN). The Worker-side
  rate limit + Better Auth's customRules are already handling these, but
  the edge view shows you what's being attempted.
- **After week 1**: weekly checks are sufficient.

### 8k. What to skip (paid or counterproductive)
- **Authenticated Origin Pulls** — needs cert installed at Vercel; Vercel
  doesn't expose this. mTLS to origin is Enterprise anyway.
- **Super Bot Fight Mode**, **OWASP Core Ruleset**, **Cloudflare
  Specials**, **Page Shield enforcement/alerts** — Pro+
- **Cloudflare Access (Zero Trust)** — could gate `/admin` with another
  auth layer, but Better Auth + the admin-email allowlist already do that.
  Adding Cloudflare Access introduces a second sign-in flow for no
  security gain.
- **Spectrum** — Enterprise; non-HTTP only
- **API Shield** — mostly paid; our Worker does Zod validation at the
  boundary
- **Cloudflare Logpush** — paid; Free Security Events page is enough at
  our scale
- **Rocket Loader** — async-loads JS; **don't enable**. Interferes with
  Sentry, `next/script` strategies, and GSAP.
- **Mirage** (image optimization) — Pro+; we already do client-side
  resize before upload

### Verify all of the above
After flipping these on, do one full sign-in + game session from an
incognito window to confirm nothing's broken. Watch DevTools Network for
any challenged requests. Common false-positive sources:
- Bot Fight Mode challenging the magic-link sign-in endpoint → add a WAF
  custom rule to skip Bot Fight on `/api/auth/sign-in/magic-link`
- WAF managed rule blocking the OAuth callback → same pattern, skip on
  `/api/auth/callback/*`
- DDoS sensitivity too high → drop one notch in Security → Settings →
  DDoS Protection

---

## 9. Renovate setup (dependency PR automation)

Config is already in the repo at `.github/renovate.json`. One-time install:

1. Go to [github.com/apps/renovate](https://github.com/apps/renovate) →
   **Install** (or **Configure** if already installed on another repo).
2. **Repository access** → **Only select repositories** → pick
   `T7SEN/coup-online`. (Don't grant org-wide access — Renovate runs whatever
   config it finds, and a stray config in another repo could spam PRs.)
3. Install. Renovate detects `.github/renovate.json` already exists and
   skips the "onboarding PR" — it starts processing within a few minutes.

### What the config does

- **Weekly batch**: all updates open between 00:00–06:00 UTC every Monday.
  No drip-feed of PRs through the week.
- **Non-major grouping**: all `minor` + `patch` bumps land in **one** PR
  titled "non-major dependencies". Easier to review than a wall of single-
  dep PRs.
- **Auto-merge after CI**: patch-only updates of `devDependencies`
  auto-merge once the three gates pass. Production deps still need eyes-on
  even for patches.
- **`@cloudflare/workers-types` opt-out**: this dep publishes nearly-daily
  date-stamped versions (`4.2026MMDD.N`). Bucketed into its own auto-merge
  group so it doesn't flood the weekly digest.
- **ESLint pin**: blocked at `<10.0.0` per launch-checklist § 0 — release
  the pin only when `eslint-plugin-react@8` ships stable.
- **Broad-surface deps tagged on major**: bumps to `better-auth`,
  `@better-auth/passkey`, `drizzle-orm`, `drizzle-kit`, `next`,
  `eslint-config-next`, `react`, `react-dom`, `hono`, `wrangler`,
  `typescript`, `zod` get labelled `major-bump` + `needs-migration-plan`
  per SKILL.md § 2 ("major bumps on broad-surface deps state as their own
  task with a brief migration plan"). Never auto-merged.
- **Security advisories**: bypass the weekly schedule (open immediately
  when found). Labelled `security`. Never auto-merged — even a one-line
  patch deserves a human read.
- **Lockfile maintenance**: a weekly refresh PR that pulls in transitive-
  dep updates not surfaced by the regular dep matchers.

### How it interacts with the three gates
Auto-merge respects branch protection rules. To make it work end-to-end,
add a GitHub Actions workflow that runs the three gates on every PR (you
likely already have this, but worth confirming). The auto-merge config uses
`platformAutomerge: true` so the merge happens at the GitHub API layer once
the required checks pass — Renovate doesn't poll or merge manually.

### Maintenance
Once installed, the only ongoing work is reviewing the weekly batched PR.
For broad-surface major bumps that land with the `needs-migration-plan`
label, treat as its own task per SKILL.md § 2 — open a draft, work through
the migration, gate three times, then merge.
