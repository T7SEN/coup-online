'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Crown,
  Loader2,
  RefreshCw,
  ScrollText,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// /admin client island — the actual tooling. The server shell (./page.tsx)
// has already verified that the viewer is the admin; this component just
// renders the UI and talks to the Worker's admin endpoints.
//
// Today's tools:
//   • Overview strip — total users, active patrons, founder slots used / 10.
//   • User search — case-insensitive substring match on email / displayName
//     / provider name; returns up to 25.
//   • Per-row Grant / Revoke patron actions.
//
// References:
//   apps/game-server/src/index.ts → /api/admin/*  for the endpoints.
//   packages/protocol/src/admin.ts → isAdminEmail for the gate.

interface AdminStats {
  totalUsers: number
  activePatrons: number
  founderSlotsUsed: number
}

interface AdminUser {
  userId: string
  email: string
  displayName: string
  image: string | null
  isPatron: boolean
  founderRank: number | null
  patronSince: number | null
  createdAt: number
}

// One row out of GET /api/admin/audit. `payload` is whatever JSON the
// emitter encoded; `{ raw: string }` shape lets the UI render unparseable
// values without crashing.
interface AdminAuditEntry {
  id: string
  adminUserId: string
  adminDisplayName: string
  action: string
  targetUserId: string | null
  targetDisplayName: string | null
  payload: unknown
  createdAt: number
}

const FOUNDER_LIMIT = 10
const SEARCH_DEBOUNCE_MS = 250
const AUDIT_PAGE_SIZE = 25

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// "2026-05-21 14:23 UTC" — locale/zone-stable string for the audit timeline.
function auditTimestamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

// Map raw action verbs to readable labels. Unknown actions show the raw
// string so a new admin action lands in the UI immediately without a code
// change here.
const ACTION_LABEL: Record<string, string> = {
  grant_patron: 'Granted patron',
  revoke_patron: 'Revoked patron',
}

// Visual tone for each action — gold for grants, neutral for revokes, etc.
const ACTION_TONE: Record<string, string> = {
  grant_patron: 'border-gold/55 bg-gold/10 text-gold',
  revoke_patron: 'border-border bg-muted text-muted-foreground',
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-gold/30 bg-card px-4 py-4 text-center">
      <span className="font-display text-2xl tabular-nums">{value}</span>
      <span className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  )
}

export function AdminConsole({
  initialStats,
}: {
  initialStats: AdminStats | null
}) {
  const [stats, setStats] = useState<AdminStats | null>(initialStats)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [searching, setSearching] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Audit log — paginated, newest-first. Page size matches the Worker's
  // default (the Worker accepts ?limit=&offset= so we could request more,
  // but a 25-row page renders cleanly).
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([])
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditHasMore, setAuditHasMore] = useState(false)
  // Per-entry expand state for the payload JSON view.
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)

  // Stats refresh — pulled after any grant/revoke so the strip stays honest.
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' })
      if (!res.ok) return
      setStats((await res.json()) as AdminStats)
    } catch {
      // silent — the existing strip stays
    }
  }, [])

  // Load a page of audit entries. `replace = true` resets the list (first
  // page or refresh); `replace = false` appends (Load more). Errors land in
  // `auditError` for inline display.
  const loadAudit = useCallback(
    async (offset: number, replace: boolean) => {
      setAuditLoading(true)
      setAuditError(null)
      try {
        const res = await fetch(
          `/api/admin/audit?limit=${AUDIT_PAGE_SIZE}&offset=${offset}`,
          { cache: 'no-store' },
        )
        if (!res.ok) throw new Error(`audit_${res.status}`)
        const json = (await res.json()) as { entries: AdminAuditEntry[] }
        setAuditEntries((cur) =>
          replace ? json.entries : [...cur, ...json.entries],
        )
        setAuditOffset(offset + json.entries.length)
        // If we got fewer than a page back, we've hit the end.
        setAuditHasMore(json.entries.length >= AUDIT_PAGE_SIZE)
      } catch {
        setAuditError('Could not load the audit log.')
      } finally {
        setAuditLoading(false)
      }
    },
    [],
  )

  // First-load: pull the most recent page on mount. Deferred via setTimeout
  // so the synchronous state setters inside loadAudit don't trip the
  // react-hooks/set-state-in-effect rule.
  useEffect(() => {
    const t = window.setTimeout(() => void loadAudit(0, true), 0)
    return () => window.clearTimeout(t)
  }, [loadAudit])

  // Debounced search. Every state setter runs inside an async callback
  // (setTimeout or fetch.then) rather than synchronously in the effect body
  // — react-hooks/set-state-in-effect.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      // Cancel any in-flight request for the previous query, then clear the
      // visible results on the next tick (defer the state writes).
      abortRef.current?.abort()
      abortRef.current = null
      const reset = window.setTimeout(() => {
        setUsers([])
        setSearching(false)
      }, 0)
      return () => window.clearTimeout(reset)
    }
    const handle = window.setTimeout(() => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setSearching(true)
      void fetch(`/api/admin/users?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
        cache: 'no-store',
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`search_failed_${res.status}`)
          const json = (await res.json()) as { users: AdminUser[] }
          setUsers(json.users)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setUsers([])
          toast.error('User search failed.')
        })
        .finally(() => setSearching(false))
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [query])

  // Action — grant or revoke. The Worker returns the updated patron block;
  // patch the user in-place rather than re-running the search.
  const act = useCallback(
    async (user: AdminUser, action: 'grant' | 'revoke') => {
      setPendingId(user.userId)
      try {
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(user.userId)}/${
            action === 'grant' ? 'grant-patron' : 'revoke-patron'
          }`,
          { method: 'POST', cache: 'no-store' },
        )
        if (!res.ok) throw new Error(`${action}_failed_${res.status}`)
        const next = (await res.json()) as {
          userId: string
          isPatron: boolean
          founderRank: number | null
          patronSince: number | null
        }
        setUsers((cur) =>
          cur.map((u) =>
            u.userId === next.userId
              ? {
                  ...u,
                  isPatron: next.isPatron,
                  founderRank: next.founderRank,
                  patronSince: next.patronSince,
                }
              : u,
          ),
        )
        toast.success(
          action === 'grant'
            ? `Patronage granted to ${user.displayName}.`
            : `Patronage revoked from ${user.displayName}.`,
        )
        void refreshStats()
        // Refresh the audit log so the new row is at the top immediately.
        void loadAudit(0, true)
      } catch {
        toast.error(
          action === 'grant'
            ? `Couldn't grant patronage.`
            : `Couldn't revoke patronage.`,
        )
      } finally {
        setPendingId(null)
      }
    },
    [refreshStats, loadAudit],
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Overview. */}
      {stats === null ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&rsquo;t load admin stats</AlertTitle>
          <AlertDescription>
            The Worker didn&rsquo;t respond on first render. Refresh the page
            to retry.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Total users" value={String(stats.totalUsers)} />
          <StatTile label="Active patrons" value={String(stats.activePatrons)} />
          <StatTile
            label="Founder slots"
            value={`${stats.founderSlotsUsed} / ${FOUNDER_LIMIT}`}
          />
        </div>
      )}

      {/* Search. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg tracking-wide">Users</h2>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search by email, nickname, or provider name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Search users"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Hints / results. */}
        {query.trim().length < 2 ? (
          <p className="rounded-md border border-dashed border-gold/25 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Type at least two characters to search.
          </p>
        ) : searching ? (
          <p className="flex items-center justify-center gap-2 rounded-md border border-dashed border-gold/25 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Searching…
          </p>
        ) : users.length === 0 ? (
          <p className="rounded-md border border-dashed border-gold/25 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No users match that query.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {users.map((u) => {
              const isPending = pendingId === u.userId
              return (
                <li
                  key={u.userId}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3 sm:gap-4 sm:px-4"
                >
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage src={u.image ?? undefined} alt="" />
                    <AvatarFallback className="text-sm">
                      {u.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p
                      dir="auto"
                      className="flex items-center gap-2 truncate font-medium"
                    >
                      {u.displayName}
                      {u.founderRank !== null && (
                        <span
                          aria-label={`Founder #${u.founderRank}`}
                          className="inline-flex items-center gap-1 rounded-full border border-gold/55 bg-gold/15 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-widest text-gold uppercase"
                        >
                          <Crown className="size-3" aria-hidden />
                          F#{u.founderRank}
                        </span>
                      )}
                      {u.isPatron && u.founderRank === null && (
                        <span
                          aria-label="Patron"
                          className="inline-flex items-center gap-1 rounded-full border border-gold/45 bg-gold/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-widest text-gold uppercase"
                        >
                          <Sparkles className="size-3" aria-hidden />
                          Patron
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} · joined {isoDate(u.createdAt)}
                    </p>
                  </div>
                  {u.isPatron ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => void act(u, 'revoke')}
                      className={cn(
                        'shrink-0',
                        isPending && 'pointer-events-none opacity-60',
                      )}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        'Revoke'
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => void act(u, 'grant')}
                      className={cn(
                        'shrink-0',
                        isPending && 'pointer-events-none opacity-60',
                      )}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        'Grant patron'
                      )}
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Audit log — newest-first record of admin writes. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-wide">
            <ScrollText className="size-4 text-gold/80" aria-hidden />
            Audit log
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadAudit(0, true)}
            disabled={auditLoading}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Refresh audit log"
          >
            <RefreshCw
              className={cn(
                'size-3.5',
                auditLoading && 'animate-spin',
              )}
              aria-hidden
            />
          </Button>
        </div>

        {auditError ? (
          <Alert variant="destructive">
            <AlertTitle>{auditError}</AlertTitle>
            <AlertDescription>
              Try refreshing — the Worker may have been briefly unreachable.
            </AlertDescription>
          </Alert>
        ) : auditEntries.length === 0 && !auditLoading ? (
          <p className="rounded-md border border-dashed border-gold/25 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No admin actions logged yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {auditEntries.map((e) => {
              const label = ACTION_LABEL[e.action] ?? e.action
              const tone =
                ACTION_TONE[e.action] ?? 'border-border text-foreground'
              const isExpanded = expandedAuditId === e.id
              const hasPayload =
                e.payload != null &&
                typeof e.payload === 'object' &&
                Object.keys(e.payload as object).length > 0
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-display text-[10px] tracking-[0.18em] uppercase',
                        tone,
                      )}
                    >
                      {label}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate">
                        <span className="font-medium">
                          {e.adminDisplayName}
                        </span>
                        {e.targetDisplayName && (
                          <>
                            <span className="text-muted-foreground"> → </span>
                            <span className="font-medium">
                              {e.targetDisplayName}
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {auditTimestamp(e.createdAt)}
                      </p>
                    </div>
                    {hasPayload && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedAuditId(isExpanded ? null : e.id)
                        }
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded ? 'Hide payload' : 'Show payload'
                        }
                        className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {hasPayload && isExpanded && (
                    <pre className="mt-1 max-h-48 overflow-auto rounded-sm border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        {auditEntries.length > 0 && auditHasMore && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={auditLoading}
              onClick={() => void loadAudit(auditOffset, false)}
            >
              {auditLoading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : null}
              Load more
            </Button>
          </div>
        )}
      </section>

      {/* Operational notes. */}
      <section className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Grant</span> sets
          {' '}<code className="font-mono text-xs">isPatron = true</code>,
          stamps <code className="font-mono text-xs">patronSince</code>, and
          assigns the next available founder rank (1–10) if fewer than ten
          founders exist. Idempotent — granting an existing patron does nothing.
        </p>
        <p>
          <span className="font-medium text-foreground">Revoke</span> clears
          every cosmetic toggle but{' '}
          <span className="text-foreground">keeps</span>{' '}
          <code className="font-mono text-xs">founderRank</code> and{' '}
          <code className="font-mono text-xs">patronSince</code>. The Hall of
          Patrons keeps the slot; re-granting later restores the patron
          without losing their founder position.
        </p>
      </section>
    </div>
  )
}
