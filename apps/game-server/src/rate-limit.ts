// SKILL.md § 5 — Per-connection rate limit.
// Cap inbound WebSocket messages at 30 per rolling 5-second window per
// connection. Excess dropped server-side with a `{ type: "rate-limit",
// retryAfterMs }` error sent back to that connection only.
//
// Sliding-window log: each connection keeps the timestamps of its recent
// ACCEPTED messages. A message is allowed only if fewer than RATE_LIMIT of
// them fall inside the trailing window — so a client cannot burst 2× the
// limit by straddling a fixed-window boundary (30 at t=4.9s + 30 at t=5.1s).
//
// In-memory WeakMap; entries are dropped automatically when the WebSocket is
// GC'd. DO hibernation may reset the map (acceptable — at most a tiny burst
// of allowed messages immediately after wake; not a security concern).

const RATE_WINDOW_MS = 5_000
const RATE_LIMIT = 30

// WebSocket → timestamps (ms) of accepted messages within the trailing window.
// Bounded: only accepted messages are recorded, so length never exceeds
// RATE_LIMIT.
const counters = new WeakMap<WebSocket, number[]>()

export interface RateCheck {
  readonly ok: boolean
  readonly retryAfterMs: number
}

export function checkAndUpdateRate(ws: WebSocket): RateCheck {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  // Keep only timestamps still inside the trailing 5-second window.
  const recent = (counters.get(ws) ?? []).filter((t) => t > cutoff)

  if (recent.length >= RATE_LIMIT) {
    // At capacity. Reject WITHOUT recording this message — a rejected message
    // must not extend the lockout. Retry once the oldest in-window message
    // ages out of the trailing window.
    counters.set(ws, recent)
    return { ok: false, retryAfterMs: Math.max(1, recent[0] - cutoff) }
  }

  recent.push(now)
  counters.set(ws, recent)
  return { ok: true, retryAfterMs: 0 }
}
