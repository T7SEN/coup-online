// SKILL.md § 5 — Per-connection rate limit.
// Cap inbound WebSocket messages at 30 per 5-second window per connection.
// Excess dropped server-side with a `{ type: "rate-limit", retryAfterMs }`
// error sent back to that connection only.
//
// In-memory WeakMap; entries are dropped automatically when the WebSocket is
// GC'd. DO hibernation may reset the map (acceptable — at most a tiny burst
// of allowed messages immediately after wake; not a security concern).

const RATE_WINDOW_MS = 5_000
const RATE_LIMIT = 30

interface Counter {
  count: number
  windowStart: number
}

const counters = new WeakMap<WebSocket, Counter>()

export interface RateCheck {
  readonly ok: boolean
  readonly retryAfterMs: number
}

export function checkAndUpdateRate(ws: WebSocket): RateCheck {
  const now = Date.now()
  const existing = counters.get(ws)
  const c: Counter =
    !existing || now - existing.windowStart > RATE_WINDOW_MS
      ? { count: 0, windowStart: now }
      : existing
  c.count++
  counters.set(ws, c)
  if (c.count > RATE_LIMIT) {
    return {
      ok: false,
      retryAfterMs: Math.max(1, RATE_WINDOW_MS - (now - c.windowStart)),
    }
  }
  return { ok: true, retryAfterMs: 0 }
}
