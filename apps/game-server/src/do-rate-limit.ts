import { DurableObject } from 'cloudflare:workers'

// HTTP rate-limit registry (SKILL.md § 3.3 — DOs are the only Worker-side
// place to share state between requests; in-memory state in regular Worker
// invocations doesn't survive across edge instances).
//
// Single instance — `idFromName('global')` — holds a per-key sliding-window
// counter in memory. Keys are `${userId}:${endpoint}`; the value is a sorted
// array of recent request timestamps. On each check we drop timestamps
// outside the window, count what's left, and either record the new request
// or reject with a `retryAfterMs` payload.
//
// Memory: bounded by `unique-active-users × distinct-endpoints` while the
// DO is warm. Cloudflare evicts idle DOs, which silently resets counters —
// that's acceptable for rate limiting (worst case an attacker gets a brief
// burst after eviction, then the new DO instance starts limiting again).
//
// We DELIBERATELY don't persist state to DO storage:
//   1. Rate-limit data has no value after eviction.
//   2. Persistence would cost a write per request, blowing up free-tier
//      D1/DO operation budgets.
// All state lives in the JS heap on the DO host machine.
//
// SKILL.md § 3.3 — SQLite-backed DO class (never `new_classes`); see the
// wrangler.toml migration block for the registration.

interface RateLimitResult {
  readonly ok: boolean
  // Present only when ok = false. The number of milliseconds the caller
  // should wait before retrying. Used to set Retry-After on the 429.
  readonly retryAfterMs?: number
}

// Soft cap on distinct keys held in memory. Hitting this is extremely
// unlikely at our scale (would mean >MAX_KEYS distinct authenticated users
// hit a rate-limited endpoint within the longest window). When it triggers,
// we drop the half with the oldest most-recent timestamp — those are the
// keys most likely to have already expired.
const MAX_KEYS = 50_000

export class RateLimitRegistry extends DurableObject<Env> {
  // Map<key, sorted-ascending array of recent request timestamps (unix ms)>.
  // `private` keeps it out of any inadvertent JSON serialization.
  private readonly windows = new Map<string, number[]>()

  // Check + record. Returns ok:true and records the new timestamp if the
  // window has room; ok:false (+ retryAfterMs) if the limit has been hit
  // and does NOT record the request (so a flood doesn't keep pushing the
  // retry-after further out).
  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    if (limit <= 0 || windowMs <= 0) {
      // Misconfiguration — fail open (allow). Better to under-limit than to
      // brick the site with a bad threshold.
      return { ok: true }
    }
    const now = Date.now()
    const windowStart = now - windowMs

    const existing = this.windows.get(key)
    // Drop timestamps outside the window. Array is sorted ascending, so we
    // can find the first in-window index with a binary-style scan; for the
    // small windows we use (single-digit counts), linear filter is fine.
    const kept = existing ? existing.filter((t) => t > windowStart) : []

    if (kept.length >= limit) {
      // Oldest in-window timestamp is at index 0; the earliest moment a new
      // request would re-enter the window is `kept[0] + windowMs`.
      const retryAfterMs = Math.max(0, kept[0] + windowMs - now)
      // Persist the pruned array so subsequent checks see the same state.
      this.windows.set(key, kept)
      return { ok: false, retryAfterMs }
    }

    kept.push(now)
    this.windows.set(key, kept)

    // Soft memory cap — kick in only when the Map is full. O(n log n) but
    // amortised to near-zero because it runs at most once per MAX_KEYS/2
    // checks.
    if (this.windows.size > MAX_KEYS) {
      this.prune()
    }
    return { ok: true }
  }

  // Drop half the keys, keeping the half whose most-recent timestamp is
  // newest. Anything older is more likely to be out-of-window already.
  private prune(): void {
    const entries = [...this.windows.entries()]
    entries.sort((a, b) => {
      const aLast = a[1][a[1].length - 1] ?? 0
      const bLast = b[1][b[1].length - 1] ?? 0
      return bLast - aLast
    })
    this.windows.clear()
    const keep = Math.floor(MAX_KEYS / 2)
    for (let i = 0; i < keep && i < entries.length; i++) {
      this.windows.set(entries[i][0], entries[i][1])
    }
  }
}
