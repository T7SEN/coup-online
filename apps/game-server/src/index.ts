import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { signDevToken } from './auth'
import { isOriginAllowed } from './origin'

const app = new Hono<{ Bindings: Env }>()

// SKILL.md § 5 — Origin allowlist mirrored on the HTTP side (POST /api/dev-token
// is browser-initiated). Same isOriginAllowed() that gates the WS upgrade.
app.use(
  '/api/*',
  cors({
    origin: (origin, c) =>
      isOriginAllowed(origin, c.env.ALLOWED_ORIGINS ?? null) ? origin : null,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

app.get('/health', (c) => c.json({ ok: true }))

// Dev-mode JWT issuer. Replaces what Auth.js v5's `app/api/ws-token/route.ts`
// will issue in production. The Worker is the verifier in both cases — only
// the issuer changes.
app.post('/api/dev-token', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'invalid_body' }, 400)
  }
  const { userId, displayName } = body as Record<string, unknown>
  if (
    typeof userId !== 'string' ||
    userId.length === 0 ||
    typeof displayName !== 'string' ||
    displayName.length === 0 ||
    displayName.length > 40
  ) {
    return c.json({ error: 'invalid_input' }, 400)
  }
  const token = await signDevToken(c.env.WS_SIGNING_SECRET, {
    userId,
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
