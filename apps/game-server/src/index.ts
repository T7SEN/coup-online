import * as Sentry from '@sentry/cloudflare'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAuth } from './auth'
import { GameRoom as GameRoomClass } from './do-game-room'
import { MatchmakingQueue as MatchmakingQueueClass } from './do-matchmaking'
import { RoomCodeRegistry as RoomCodeRegistryClass } from './do-room-codes'
import { logger } from './logger'
import { isOriginAllowed } from './origin'
import { signWsToken } from './ws-token'

const app = new Hono<{ Bindings: Env }>()

// SKILL.md § 5 — Origin allowlist on browser-facing routes. The /api/auth/*
// and /api/ws-token paths are accessed via Next.js's `rewrites` (server-to-
// server from Vercel), so the Origin header is typically absent there and
// CORS is a no-op; Better Auth's `trustedOrigins` is what enforces CSRF.
//
// The /api/ws upgrade is browser-direct (browsers can't go through Next.js
// rewrites for WebSockets) — that's where this CORS / Origin check matters.
app.use(
  '/api/*',
  cors({
    origin: (origin, c) =>
      isOriginAllowed(origin, c.env.ALLOWED_ORIGINS ?? null) ? origin : null,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

// SKILL.md § 5 — funnel Hono route-handler errors into Sentry. Hono catches
// uncaught errors from route handlers internally and would otherwise just
// return a 500 that withSentry never observes; this hook reports them
// explicitly via the logger. It runs inside the withSentry request scope, so
// the capture routes to SENTRY_DSN_WORKER.
app.onError((err, c) => {
  logger.error('hono route handler error', err)
  return c.json({ error: 'internal_error' }, 500)
})

app.get('/health', (c) => c.json({ ok: true }))

// Better Auth catch-all (better-auth.com/docs). Mounts Better Auth's internal
// router under /api/auth/*. The browser hits these paths on the Vercel origin
// (cookies stay there); Next.js's `rewrites` proxies the request here for the
// actual handling. Set-Cookie headers flow back through the proxy.
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  return createAuth(c.env).handler(c.req.raw)
})

// WS-upgrade JWT issuance. SKILL.md § 5 — after a Better Auth session check,
// signs a 5-minute HS256 JWT with WS_SIGNING_SECRET. The Vercel rewrites
// forward POST /api/ws-token here with the browser's session cookie attached.
app.post('/api/ws-token', async (c) => {
  const auth = createAuth(c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user?.id) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  // `||` (not `??`) — Better Auth may persist `name` as an empty string for
  // magic-link signups. Empty-string would propagate into the JWT and show as
  // a blank seat name in-game. trim() catches whitespace-only.
  const displayName =
    session.user.name?.trim() ||
    session.user.email?.split('@')[0]?.trim() ||
    'Player'
  const token = await signWsToken(c.env.WS_SIGNING_SECRET, {
    userId: session.user.id,
    displayName,
  })
  return c.json({ token })
})

// WebSocket upgrade. Worker checks Origin (early reject of cross-origin
// hijacking — SKILL.md § 5); the DO handles JWT verification, hibernation
// accept, and message dispatch.
app.get('/api/ws', async (c) => {
  if (c.req.header('upgrade') !== 'websocket') {
    return c.text('Upgrade Required', 426)
  }
  if (!isOriginAllowed(c.req.header('Origin') ?? null, c.env.ALLOWED_ORIGINS ?? null)) {
    return c.text('Forbidden', 403)
  }
  const matchId = c.req.query('matchId')
  if (!matchId || matchId.length === 0) {
    return c.text('matchId query param required', 400)
  }
  // env.GAME_ROOM is the DO namespace binding (wrangler.toml).
  // idFromName(matchId) gives a stable mapping so the same matchId always
  // routes to the same DO instance.
  const id = c.env.GAME_ROOM.idFromName(matchId)
  const stub = c.env.GAME_ROOM.get(id)
  return stub.fetch(c.req.raw)
})

// SKILL.md § 5 — Sentry on the Worker. The factory reads the DSN per-request
// from env; when SENTRY_DSN_WORKER is unset (typical local dev) the SDK
// initializes disabled and every capture no-ops. tracesSampleRate is kept low
// to stay inside the free-tier span quota; sendDefaultPii is false so user IPs
// are never shipped to Sentry (SKILL.md § 3.6 — minimal PII).
function sentryOptions(env: Env) {
  return {
    dsn: env.SENTRY_DSN_WORKER,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Sentry Logs product. Metrics need no flag — on by default in SDK
    // ≥ 10.25; `Sentry.metrics.*` calls wired when there's a metric to send.
    // Session Replay / User Feedback are browser-only — N/A on the Worker.
    enableLogs: true,
  }
}

// The Hono app is the fetch handler; withSentry wraps it so unhandled errors
// in HTTP routes are captured.
export default Sentry.withSentry(sentryOptions, app)

// Workers convention: re-export DO classes at the entry module so the runtime
// can instantiate them by class name as declared in wrangler.toml's
// [[durable_objects.bindings]]. Each is wrapped with Sentry DO instrumentation
// — the export name must still match the wrangler `class_name`.
export const GameRoom = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  GameRoomClass,
)
export const MatchmakingQueue = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  MatchmakingQueueClass,
)
export const RoomCodeRegistry = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  RoomCodeRegistryClass,
)
