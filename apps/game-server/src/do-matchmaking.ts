import { DurableObject } from 'cloudflare:workers'

// Global MatchmakingQueue DO — **v2 scope** (SKILL.md § 3.4).
//
// v1 ships private-rooms-only; this class is intentionally a 501 stub. The
// binding stays in wrangler.toml under the existing `v1` SQLite migration
// tag so v2 can flip the implementation on without a new DO migration
// (DO migrations are append-only once deployed — see SKILL.md § 3.3).
//
// v2 design: periodic match-fanout via DO Alarm (every 2s) pairs 3-6
// players within a conservative-rating band (mu − 3·sigma, ±100 expanding
// ±50 per 30s waited, cap ±400), spawns a GameRoom DO, and notifies
// participants via their existing WebSocket to switch rooms.
export class MatchmakingQueue extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response('MatchmakingQueue: v2 scope', { status: 501 })
  }
}
