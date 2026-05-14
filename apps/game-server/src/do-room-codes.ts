import { DurableObject } from 'cloudflare:workers'

// Private-room code registry (SKILL.md § 3.3).
// Codes are 6 chars from base32 alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no ambiguous
// chars). Generated via crypto.getRandomValues() — never Math.random (SKILL.md § 5).
// Codes expire 30 minutes after creation if no game starts.
export class RoomCodeRegistry extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response('RoomCodeRegistry: not implemented', { status: 501 })
  }
}
