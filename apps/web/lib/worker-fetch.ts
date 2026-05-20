import { redirect } from 'next/navigation'
import { GAME_SERVER_HTTP } from '@/lib/config'

// fetchWorker — every Server Component fetch to the game-server Worker should
// go through this helper rather than calling `fetch` directly.
//
// What it hides:
//
//   1. The base URL — pass just the path (`/api/me/profile`); the helper
//      prepends `GAME_SERVER_HTTP`.
//   2. Infrastructure failure → /maintenance. If the Worker is unreachable
//      (network throw — DNS, connection refused, timeout) or returns a 5xx,
//      the helper calls `redirect('/maintenance')` directly. Callers never
//      observe those failure modes; a returned `Response` is always either
//      OK or a deliberate 4xx (401 / 404 / etc.) that the caller handles
//      inline.
//
// 4xx responses pass through. The caller decides whether 401 → signin or
// 404 → notFound(). This keeps "real" application errors distinct from
// "infrastructure is down" errors, which is what /maintenance is for.
//
// `redirect()` works by throwing a `NEXT_REDIRECT` error that Next intercepts
// at the framework boundary. The catch block here cannot capture it (we only
// run user code inside `fetch()`, which never calls `redirect()`), so we don't
// need any rethrow logic. Note that `redirect()` is typed `never`, so TS
// narrows `res` to a definitely-assigned `Response` after the try/catch.
//
// Loop safety: the /maintenance page is fully static — it makes no Worker
// calls — so there is no possibility of redirecting into a loop.

export async function fetchWorker(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${GAME_SERVER_HTTP}${path}`, init)
  } catch {
    // Network-level failure. Worker is unreachable.
    redirect('/maintenance')
  }
  if (res.status >= 500) {
    // Worker reachable but errored (502 / 503 / 504 / 500). Same treatment.
    redirect('/maintenance')
  }
  return res
}

// Probe the Worker's /health endpoint. Used by Server Components that have no
// other Worker call of their own (e.g. /play, whose interactivity is
// client-driven) to gate page render on the Worker actually being reachable.
// `fetchWorker` does the redirect on failure; a successful return means the
// caller can proceed to render.
export async function probeWorker(): Promise<void> {
  await fetchWorker('/health', { cache: 'no-store' })
}
