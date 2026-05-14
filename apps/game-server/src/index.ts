import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.get('/health', (c) => c.json({ ok: true }))

export default app

// Workers convention: re-export DO classes at the entry module so the runtime can
// instantiate them by class name as declared in wrangler.toml's [[durable_objects.bindings]].
export { GameRoom } from './do-game-room'
export { MatchmakingQueue } from './do-matchmaking'
export { RoomCodeRegistry } from './do-room-codes'
