import { useSyncExternalStore } from 'react'

// SKILL.md § 5 — Hydration safety.
//
// Returns `false` during SSR and the initial client render (matching SSR
// output so hydration doesn't mismatch), then `true` after hydration
// completes. Lets components that need browser-only access (localStorage,
// sessionStorage, navigator, etc.) render a stable placeholder on the server
// and a real value once mounted — without resorting to `setState` inside a
// `useEffect`, which the React 19 lint rule
// (`react-hooks/set-state-in-effect`) disallows.
//
// Implementation: `useSyncExternalStore` is the React 19-blessed primitive
// for SSR-safe external state. The `subscribe` is a no-op because nothing
// changes after the initial mount transition. The two snapshot functions
// give React the values it needs:
//   - getServerSnapshot → `false` (used during SSR + first client render)
//   - getSnapshot       → `true`  (used after hydration commits)

const subscribe = (): (() => void) => () => {}
const getClientSnapshot = (): boolean => true
const getServerSnapshot = (): boolean => false

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
