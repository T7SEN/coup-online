import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAuth } from './auth'
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

export default app

// Workers convention: re-export DO classes at the entry module so the runtime can
// instantiate them by class name as declared in wrangler.toml's [[durable_objects.bindings]].
export { GameRoom } from './do-game-room'
export { MatchmakingQueue } from './do-matchmaking'
export { RoomCodeRegistry } from './do-room-codes'
