import { DurableObject } from 'cloudflare:workers'

// One SQLite-backed DO per match (SKILL.md § 3.3).
// Hibernation API (SKILL.md § 3.3): use ctx.acceptWebSocket() so the DO sleeps
// between messages while connections persist. Plain ws.accept() defeats hibernation
// and accrues continuous duration charges.
// Game state machine: SKILL.md § 3.2.
export class GameRoom extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response('GameRoom: not implemented', { status: 501 })
  }
}
