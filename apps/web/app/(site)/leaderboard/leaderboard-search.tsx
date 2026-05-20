'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'

// Leaderboard player search — a typeahead in the leaderboard header. The
// leaderboard page itself only shows the top 100; this finds any ranked
// player by nickname and links through to their public profile. Results come
// from the Worker's /api/players/search (proxied by next.config.ts's
// /api/players/* rewrite, so this works as a same-origin browser fetch).

const MIN_QUERY = 2
const DEBOUNCE_MS = 250

interface PlayerResult {
  userId: string
  displayName: string
  image: string | null
  rating: number
  played: number
  wins: number
}

export function LeaderboardSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerResult[]>([])
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [open, setOpen] = useState(false)

  // Debounced search. Each keystroke restarts the timer and aborts the
  // in-flight request, so only the latest query resolves. All state updates
  // happen inside the timer / promise callbacks — never synchronously in the
  // effect body — so React doesn't see cascading renders.
  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY) return

    const controller = new AbortController()
    const timer = setTimeout(() => {
      setBusy(true)
      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error('search failed')
          return res.json() as Promise<{ players: PlayerResult[] }>
        })
        .then((json) => {
          setResults(json.players)
          setSearched(true)
          setBusy(false)
        })
        .catch((err: unknown) => {
          setBusy(false)
          // An abort just means a newer keystroke superseded this request.
          if (err instanceof Error && err.name === 'AbortError') return
          setResults([])
          setSearched(true)
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const trimmed = query.trim()
  const showPanel = open && trimmed.length >= MIN_QUERY

  return (
    <div className="relative">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Search players by name…"
          aria-label="Search players"
          className="h-10 px-9"
        />
        {busy ? (
          <Loader2
            aria-hidden
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : (
          query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setOpen(false)
              }}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )
        )}
      </div>

      {showPanel && (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div
            role="listbox"
            aria-label="Search results"
            className="absolute inset-x-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
          >
            {busy && results.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                Searching…
              </p>
            ) : results.length === 0 && searched ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No players found.
              </p>
            ) : (
              <ul className="flex flex-col py-1">
                {results.map((p) => (
                  <li key={p.userId}>
                    <Link
                      href={`/profile/${p.userId}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/60"
                    >
                      <Avatar className="size-9 shrink-0">
                        <AvatarImage src={p.image ?? undefined} alt="" />
                        <AvatarFallback className="text-sm">
                          {p.displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="truncate font-medium">
                          {p.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.wins}W · {Math.max(0, p.played - p.wins)}L
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-lg tabular-nums">
                        {p.rating}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
