import { DurableObject } from 'cloudflare:workers'

// Global MatchmakingQueue DO (SKILL.md § 3.4).
// Periodic match-fanout via DO Alarm (every 2s) pairs 3-6 players within an MMR band,
// spawns a GameRoom DO, and notifies via existing WebSockets to switch rooms.
export class MatchmakingQueue extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response('MatchmakingQueue: not implemented', { status: 501 })
  }
}
