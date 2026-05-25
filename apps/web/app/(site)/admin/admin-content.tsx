'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  Crown,
  Database,
  Eraser,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  ShieldOff,
  Sparkles,
  Swords,
  Trash2,
  Wrench,
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
  profileImage: string | null
  isPatron: boolean
  founderRank: number | null
  patronSince: number | null
  bannedAt: number | null
  banReason: string | null
  createdAt: number
}

// One row from GET /api/admin/active-matches. Drives the live-games panel.
interface ActiveMatch {
  matchId: string
  startedAt: number
  seatCount: number
  hostUserId: string
  hostDisplayName: string
}

// GET /api/admin/quota response — D1 row counts plus R2 bucket totals.
interface QuotaStats {
  d1: {
    users: number
    matches: number
    matchPlayers: number
    mmrHistory: number
    activeMatches: number
    sessions: number
    auditEntries: number
  }
  r2: {
    avatars: { objects: number; bytes: number; truncated: boolean }
    banners: { objects: number; bytes: number; truncated: boolean }
    ceiling: number
  }
}

interface MaintenanceSetting {
  enabled: boolean
  message: string
  updatedAt: number | null
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
// How long the "Confirm reset" button stays live after the first click.
// Long enough for a deliberate confirm, short enough that a forgotten armed
// state can't be triggered by an accidental click minutes later.
const REARM_TIMEOUT_MS = 4_000

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
  reset_mmr: 'Reset MMR',
  ban_user: 'Banned user',
  unban_user: 'Unbanned user',
  clear_identity: 'Cleared identity',
  delete_user: 'Deleted user',
  force_end_match: 'Force-ended match',
  set_maintenance: 'Set maintenance',
}

// Visual tone for each action — gold for grants, neutral for revokes, etc.
const ACTION_TONE: Record<string, string> = {
  grant_patron: 'border-gold/55 bg-gold/10 text-gold',
  revoke_patron: 'border-border bg-muted text-muted-foreground',
  // Destructive actions share the red palette so they pop in the timeline.
  reset_mmr: 'border-destructive/55 bg-destructive/10 text-destructive',
  ban_user: 'border-destructive/55 bg-destructive/10 text-destructive',
  delete_user: 'border-destructive/55 bg-destructive/10 text-destructive',
  force_end_match: 'border-destructive/55 bg-destructive/10 text-destructive',
  // Soft-reversible actions in neutral.
  unban_user: 'border-border bg-muted text-muted-foreground',
  clear_identity: 'border-border bg-muted text-muted-foreground',
  set_maintenance: 'border-gold/55 bg-gold/10 text-gold',
}

// Format byte counts as "1.2 KB", "5.8 MB" — used in the R2 quota strip.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// "5m ago" / "2h ago" / "3d ago" — used in the live-games panel.
function relativeAge(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const s = Math.floor(delta / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
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
  // Reset MMR — two-step confirm. `armed` flips to true on the first click;
  // a second click within REARM_TIMEOUT_MS actually fires. The countdown
  // auto-disarms so the destructive button doesn't sit live forever.
  const [resetArmed, setResetArmed] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const rearmTimeoutRef = useRef<number | null>(null)
  // Active matches — list of live games from match_active. `null` while
  // the initial fetch is in flight; [] when there are no live games.
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[] | null>(null)
  const [activeMatchesLoading, setActiveMatchesLoading] = useState(true)
  const [forceEndingMatchId, setForceEndingMatchId] = useState<string | null>(null)
  // Quota — D1 + R2 stats. Null until first fetch resolves.
  const [quota, setQuota] = useState<QuotaStats | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  // Maintenance mode — current setting + editable draft message.
  const [maintenance, setMaintenance] = useState<MaintenanceSetting | null>(null)
  const [maintenanceDraft, setMaintenanceDraft] = useState('')
  const [maintenanceSaving, setMaintenanceSaving] = useState(false)
  // Per-user action pending state — separated from `pendingId` (used by
  // grant/revoke) so a long delete doesn't grey out the row's clear
  // button. Each action sets its own pending; UI checks both for "this
  // row is busy".
  const [actingUserId, setActingUserId] = useState<string | null>(null)
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

  // Active matches loader. Called on mount and after force-end so the
  // panel stays fresh without polling. Soft-fail to [] on errors — the UI
  // shows a "couldn't load" line instead of a crash.
  const loadActiveMatches = useCallback(async () => {
    setActiveMatchesLoading(true)
    try {
      const res = await fetch('/api/admin/active-matches', { cache: 'no-store' })
      if (!res.ok) throw new Error(`active_matches_${res.status}`)
      const json = (await res.json()) as { matches: ActiveMatch[] }
      setActiveMatches(json.matches)
    } catch {
      setActiveMatches([])
    } finally {
      setActiveMatchesLoading(false)
    }
  }, [])

  // Quota loader. Same shape — null until fetched, soft-fail to null on
  // error (the UI renders a "couldn't load" alert).
  const loadQuota = useCallback(async () => {
    setQuotaLoading(true)
    try {
      const res = await fetch('/api/admin/quota', { cache: 'no-store' })
      if (!res.ok) throw new Error(`quota_${res.status}`)
      setQuota((await res.json()) as QuotaStats)
    } catch {
      setQuota(null)
    } finally {
      setQuotaLoading(false)
    }
  }, [])

  // Maintenance loader — also seeds the editable draft message.
  const loadMaintenance = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/maintenance', { cache: 'no-store' })
      if (!res.ok) throw new Error(`maintenance_${res.status}`)
      const data = (await res.json()) as MaintenanceSetting
      setMaintenance(data)
      setMaintenanceDraft(data.message)
    } catch {
      setMaintenance(null)
    }
  }, [])

  // Mount: fetch the three new panels in parallel. Deferred via setTimeout
  // for the same react-hooks/set-state-in-effect reason as loadAudit.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadActiveMatches()
      void loadQuota()
      void loadMaintenance()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadActiveMatches, loadQuota, loadMaintenance])

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

  // Arm / disarm the destructive reset button. First click arms (and starts
  // an auto-disarm timer); second click within the window fires the reset.
  // Cancel button (and tab-blur, unmount) clears the timer.
  const armReset = useCallback(() => {
    setResetArmed(true)
    if (rearmTimeoutRef.current !== null) {
      window.clearTimeout(rearmTimeoutRef.current)
    }
    rearmTimeoutRef.current = window.setTimeout(() => {
      setResetArmed(false)
      rearmTimeoutRef.current = null
    }, REARM_TIMEOUT_MS)
  }, [])

  const disarmReset = useCallback(() => {
    setResetArmed(false)
    if (rearmTimeoutRef.current !== null) {
      window.clearTimeout(rearmTimeoutRef.current)
      rearmTimeoutRef.current = null
    }
  }, [])

  // Clean up the auto-disarm timer on unmount so we don't setState into a
  // dead component if the admin navigates away mid-arm.
  useEffect(() => {
    return () => {
      if (rearmTimeoutRef.current !== null) {
        window.clearTimeout(rearmTimeoutRef.current)
      }
    }
  }, [])

  // Reset — wipes every match, match_player, mmr_history row, and resets
  // every user's mu/sigma to the TrueSkill defaults. Server is idempotent;
  // double-firing is harmless (second call returns counts of zero).
  const runReset = useCallback(async () => {
    disarmReset()
    setResetPending(true)
    try {
      const res = await fetch('/api/admin/reset-mmr', {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`reset_failed_${res.status}`)
      const counts = (await res.json()) as {
        matches: number
        matchPlayers: number
        mmrHistory: number
        usersReset: number
      }
      toast.success(
        `MMR reset — cleared ${counts.matches} matches, ${counts.mmrHistory} history rows, reset ${counts.usersReset} users.`,
      )
      void loadAudit(0, true)
    } catch {
      toast.error("Couldn't reset MMR. Check the Worker logs.")
    } finally {
      setResetPending(false)
    }
  }, [disarmReset, loadAudit])

  // Ban / unban — flips the user row's `bannedAt` via the Worker. On
  // success patches the row in-place so the UI updates without re-search.
  const toggleBan = useCallback(
    async (u: AdminUser) => {
      const isBanned = u.bannedAt != null
      setActingUserId(u.userId)
      try {
        let reason: string | null = null
        if (!isBanned) {
          // Browser prompt — minimal UX. Cancel → null cancels the whole
          // action; empty string → ban with no reason; non-empty string →
          // ban with that reason. Saves building a modal for a rarely-used
          // admin action.
          const input = window.prompt(
            `Ban "${u.displayName}"? Optional reason (admin-only, never shown to the user):`,
            '',
          )
          if (input === null) {
            setActingUserId(null)
            return
          }
          reason = input.trim() || null
        }
        const path = isBanned ? 'unban' : 'ban'
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(u.userId)}/${path}`,
          {
            method: 'POST',
            cache: 'no-store',
            headers: isBanned ? undefined : { 'Content-Type': 'application/json' },
            body: isBanned ? undefined : JSON.stringify({ reason }),
          },
        )
        if (!res.ok) throw new Error(`${path}_failed_${res.status}`)
        setUsers((cur) =>
          cur.map((x) =>
            x.userId === u.userId
              ? {
                  ...x,
                  bannedAt: isBanned ? null : Date.now(),
                  banReason: isBanned ? null : reason,
                }
              : x,
          ),
        )
        toast.success(
          isBanned
            ? `Unbanned ${u.displayName}.`
            : `Banned ${u.displayName}.`,
        )
        void loadAudit(0, true)
      } catch {
        toast.error(isBanned ? "Couldn't unban." : "Couldn't ban.")
      } finally {
        setActingUserId(null)
      }
    },
    [loadAudit],
  )

  // Clear identity — surfaces a small inline confirm via window.confirm.
  // Server endpoint accepts independent flags so a future UI iteration
  // could let admin pick which to clear; for now we clear all three at once
  // (the common case is "this user is being abusive in every dimension").
  const clearIdentity = useCallback(
    async (u: AdminUser) => {
      if (
        !window.confirm(
          `Clear "${u.displayName}"'s nickname, avatar, and banner? (Account stays, all cosmetic fields reset.)`,
        )
      ) return
      setActingUserId(u.userId)
      try {
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(u.userId)}/clear-identity`,
          {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayName: true,
              avatar: true,
              banner: true,
            }),
          },
        )
        if (!res.ok) throw new Error(`clear_failed_${res.status}`)
        // Patch the visible row so the avatar/banner blank out immediately;
        // the displayName falls back to provider `email` prefix since we
        // don't get a fresh row back, but next search refresh corrects it.
        setUsers((cur) =>
          cur.map((x) =>
            x.userId === u.userId
              ? { ...x, image: null, profileImage: null, displayName: x.email.split('@')[0] }
              : x,
          ),
        )
        toast.success(`Cleared ${u.displayName}'s identity.`)
        void loadAudit(0, true)
      } catch {
        toast.error("Couldn't clear identity.")
      } finally {
        setActingUserId(null)
      }
    },
    [loadAudit],
  )

  // Delete user — anonymise + purge sessions/accounts/passkeys/friends.
  // Two confirms: typed displayName match defeats fat-fingered destructive
  // clicks. No "undo" — the row stays in the DB as "Deleted player".
  const deleteUser = useCallback(
    async (u: AdminUser) => {
      const typed = window.prompt(
        `Delete "${u.displayName}"? This anonymises the account and purges sign-in. Type the displayName to confirm:`,
        '',
      )
      if (typed == null) return
      if (typed.trim() !== u.displayName.trim()) {
        toast.error('Name did not match — delete cancelled.')
        return
      }
      setActingUserId(u.userId)
      try {
        const res = await fetch(
          `/api/admin/users/${encodeURIComponent(u.userId)}/delete`,
          { method: 'POST', cache: 'no-store' },
        )
        if (!res.ok) throw new Error(`delete_failed_${res.status}`)
        // Drop the row from the search result so the admin sees the action
        // landed. A re-search would surface the anonymised "Deleted player"
        // row.
        setUsers((cur) => cur.filter((x) => x.userId !== u.userId))
        toast.success(`Deleted ${u.displayName}.`)
        void refreshStats()
        void loadAudit(0, true)
      } catch {
        toast.error("Couldn't delete user.")
      } finally {
        setActingUserId(null)
      }
    },
    [refreshStats, loadAudit],
  )

  // Force-end a live match. One confirm — admins use this to unstick
  // wedged DOs, so an extra hop would slow recovery.
  const forceEndMatch = useCallback(
    async (matchId: string) => {
      if (
        !window.confirm(
          `Force-end match ${matchId.slice(0, 8)}…? Connected clients get a "room closed by admin" disconnect.`,
        )
      ) return
      setForceEndingMatchId(matchId)
      try {
        const res = await fetch(
          `/api/admin/matches/${encodeURIComponent(matchId)}/end`,
          { method: 'POST', cache: 'no-store' },
        )
        if (!res.ok) throw new Error(`force_end_${res.status}`)
        toast.success('Match ended.')
        // Drop the row optimistically; loadActiveMatches confirms from
        // the source of truth.
        setActiveMatches((cur) =>
          cur === null ? cur : cur.filter((m) => m.matchId !== matchId),
        )
        void loadActiveMatches()
        void loadAudit(0, true)
      } catch {
        toast.error("Couldn't end match.")
      } finally {
        setForceEndingMatchId(null)
      }
    },
    [loadActiveMatches, loadAudit],
  )

  // Maintenance toggle. Single call updates both `enabled` and `message`
  // so the admin can write the message FIRST in the field, then flip the
  // toggle without a separate save step.
  const saveMaintenance = useCallback(
    async (nextEnabled: boolean) => {
      setMaintenanceSaving(true)
      try {
        const res = await fetch('/api/admin/maintenance', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: nextEnabled,
            message: maintenanceDraft,
          }),
        })
        if (!res.ok) throw new Error(`maintenance_${res.status}`)
        setMaintenance({
          enabled: nextEnabled,
          message: maintenanceDraft,
          updatedAt: Date.now(),
        })
        toast.success(
          nextEnabled
            ? 'Maintenance mode ON — visitors see a banner; games are paused.'
            : 'Maintenance mode OFF — site fully reopened.',
        )
        void loadAudit(0, true)
      } catch {
        toast.error("Couldn't save maintenance setting.")
      } finally {
        setMaintenanceSaving(false)
      }
    },
    [maintenanceDraft, loadAudit],
  )

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

      {/* Quota strip — D1 row totals and R2 object/byte totals. Free-tier
          watch panel: 5 GB D1, 10 GB R2 are the relevant ceilings. Numbers
          render as 0 until the initial fetch resolves. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-wide">
            <Database className="size-4 text-gold/80" aria-hidden />
            Storage & quota
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadQuota()}
            disabled={quotaLoading}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Refresh quota"
          >
            <RefreshCw
              className={cn('size-3.5', quotaLoading && 'animate-spin')}
              aria-hidden
            />
          </Button>
        </div>
        {quota === null && !quotaLoading ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&rsquo;t load quota stats</AlertTitle>
            <AlertDescription>Refresh to retry.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Matches (D1)"
              value={String(quota?.d1.matches ?? 0)}
            />
            <StatTile
              label="MMR history"
              value={String(quota?.d1.mmrHistory ?? 0)}
            />
            <StatTile
              label="Active matches"
              value={String(quota?.d1.activeMatches ?? 0)}
            />
            <StatTile
              label="Sessions"
              value={String(quota?.d1.sessions ?? 0)}
            />
            <StatTile
              label="Avatars (R2)"
              value={`${quota?.r2.avatars.objects ?? 0} · ${formatBytes(quota?.r2.avatars.bytes ?? 0)}`}
            />
            <StatTile
              label="Banners (R2)"
              value={`${quota?.r2.banners.objects ?? 0} · ${formatBytes(quota?.r2.banners.bytes ?? 0)}`}
            />
            <StatTile
              label="Audit log"
              value={String(quota?.d1.auditEntries ?? 0)}
            />
            <StatTile
              label="Match players"
              value={String(quota?.d1.matchPlayers ?? 0)}
            />
          </div>
        )}
        {(quota?.r2.avatars.truncated || quota?.r2.banners.truncated) && (
          <p className="text-xs text-muted-foreground">
            R2 listing truncated at {quota?.r2.ceiling.toLocaleString()} objects per prefix.
          </p>
        )}
      </section>

      {/* Maintenance mode toggle. Server-side gate refuses ws-token mint
          for everyone except the admin while enabled; the global layout
          shows a banner to visitors. Message is editable inline. */}
      <section className="flex flex-col gap-3 rounded-md border border-gold/30 bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-wide">
            <Wrench className="size-4 text-gold/80" aria-hidden />
            Maintenance mode
          </h2>
          {maintenance?.enabled ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-destructive/55 bg-destructive/10 px-2 py-0.5 font-display text-[10px] tracking-[0.18em] text-destructive uppercase">
              On
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 font-display text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Off
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          When ON, signed-in visitors see a banner across every page, and the
          ws-token endpoint refuses new game connections for everyone except
          you. Existing games keep running until they end naturally — use{' '}
          <span className="font-medium text-foreground">Live games → End</span>{' '}
          below to force any in-flight match.
        </p>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="maintenance-message"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Banner message
          </label>
          <Input
            id="maintenance-message"
            type="text"
            placeholder="Coup Online is briefly offline for maintenance."
            value={maintenanceDraft}
            onChange={(e) => setMaintenanceDraft(e.target.value)}
            maxLength={240}
            disabled={maintenanceSaving}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {maintenance?.enabled ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={maintenanceSaving}
              onClick={() => void saveMaintenance(false)}
            >
              {maintenanceSaving ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : null}
              Turn off
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={maintenanceSaving}
              onClick={() => void saveMaintenance(true)}
            >
              {maintenanceSaving ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <Wrench className="mr-1.5 size-3.5" aria-hidden />
              )}
              Turn on
            </Button>
          )}
          {maintenance?.enabled && maintenanceDraft !== maintenance.message && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={maintenanceSaving}
              onClick={() => void saveMaintenance(true)}
            >
              Update banner text
            </Button>
          )}
        </div>
      </section>

      {/* Live games — the active-match registry. Force-end uses the
          internal DO route; it's the right tool for stuck-DO recovery. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg tracking-wide">
            <Swords className="size-4 text-gold/80" aria-hidden />
            Live games
            {activeMatches !== null && (
              <span className="font-display text-sm text-muted-foreground tabular-nums">
                ({activeMatches.length})
              </span>
            )}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadActiveMatches()}
            disabled={activeMatchesLoading}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Refresh live games"
          >
            <RefreshCw
              className={cn(
                'size-3.5',
                activeMatchesLoading && 'animate-spin',
              )}
              aria-hidden
            />
          </Button>
        </div>
        {activeMatches === null ? (
          <p className="rounded-md border border-dashed border-gold/25 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : activeMatches.length === 0 ? (
          <p className="rounded-md border border-dashed border-gold/25 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
            No live games right now.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {activeMatches.map((m) => {
              const isEnding = forceEndingMatchId === m.matchId
              return (
                <li
                  key={m.matchId}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3 sm:gap-4 sm:px-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p
                      dir="auto"
                      className="truncate font-medium tabular-nums"
                    >
                      {m.matchId.slice(0, 8)}…
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.seatCount} seats · hosted by {m.hostDisplayName} ·
                      started {relativeAge(m.startedAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={isEnding}
                    onClick={() => void forceEndMatch(m.matchId)}
                    className="shrink-0"
                  >
                    {isEnding ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      'End'
                    )}
                  </Button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

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
              const isActing = actingUserId === u.userId
              const rowBusy = isPending || isActing
              const isBanned = u.bannedAt != null
              return (
                <li
                  key={u.userId}
                  className={cn(
                    'flex flex-col gap-3 rounded-md border bg-card px-3 py-3 sm:px-4',
                    isBanned ? 'border-destructive/40' : 'border-border',
                  )}
                >
                  {/* Top row — identity + patron action. */}
                  <div className="flex items-center gap-3 sm:gap-4">
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
                        {isBanned && (
                          <span
                            aria-label="Banned"
                            className="inline-flex items-center gap-1 rounded-full border border-destructive/55 bg-destructive/10 px-1.5 py-0.5 text-[0.6rem] font-medium tracking-widest text-destructive uppercase"
                          >
                            <Ban className="size-3" aria-hidden />
                            Banned
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email} · joined {isoDate(u.createdAt)}
                      </p>
                      {isBanned && u.banReason && (
                        <p className="truncate text-xs text-destructive/80">
                          Ban reason: {u.banReason}
                        </p>
                      )}
                    </div>
                    {u.isPatron ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rowBusy}
                        onClick={() => void act(u, 'revoke')}
                        className={cn(
                          'shrink-0',
                          rowBusy && 'pointer-events-none opacity-60',
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
                        disabled={rowBusy}
                        onClick={() => void act(u, 'grant')}
                        className={cn(
                          'shrink-0',
                          rowBusy && 'pointer-events-none opacity-60',
                        )}
                      >
                        {isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          'Grant patron'
                        )}
                      </Button>
                    )}
                  </div>
                  {/* Moderation row — ban/unban, clear identity, delete.
                      Wraps on narrow viewports so buttons don't overflow. */}
                  <div className="flex flex-wrap items-center gap-2 sm:pl-13">
                    <Button
                      type="button"
                      size="sm"
                      variant={isBanned ? 'outline' : 'destructive'}
                      disabled={rowBusy}
                      onClick={() => void toggleBan(u)}
                      className="shrink-0"
                    >
                      {isActing ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                      ) : isBanned ? (
                        <ShieldOff className="mr-1.5 size-3.5" aria-hidden />
                      ) : (
                        <Ban className="mr-1.5 size-3.5" aria-hidden />
                      )}
                      {isBanned ? 'Unban' : 'Ban'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={rowBusy}
                      onClick={() => void clearIdentity(u)}
                      className="shrink-0"
                    >
                      <Eraser className="mr-1.5 size-3.5" aria-hidden />
                      Clear identity
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={rowBusy}
                      onClick={() => void deleteUser(u)}
                      className="shrink-0"
                    >
                      <Trash2 className="mr-1.5 size-3.5" aria-hidden />
                      Delete
                    </Button>
                  </div>
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

      {/* Danger zone — destructive admin tools. Visually walled off with a
          red border + warning header so it can't be mistaken for routine
          tooling. The reset button itself is two-step: first click arms,
          second click within REARM_TIMEOUT_MS fires. Auto-disarms on a
          countdown so a forgotten armed state can't be triggered later. */}
      <section className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className="size-4 text-destructive"
            aria-hidden
          />
          <h2 className="font-display text-lg tracking-wide text-destructive">
            Danger zone
          </h2>
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Reset MMR</span>{' '}
            wipes every match, every match-player row, and every rating-history
            entry, then resets every user&rsquo;s rating back to{' '}
            <code className="font-mono text-xs">μ=25, σ=25/3</code>. Patron
            flags, display names, avatars, and account data are untouched.
          </p>
          <p className="text-xs">
            Use this for a season rollover or to clear test data before
            launch. Cannot be undone.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!resetArmed ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={resetPending}
              onClick={armReset}
              className="shrink-0"
            >
              {resetPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="mr-1.5 size-3.5" aria-hidden />
              )}
              Reset MMR
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={resetPending}
                onClick={() => void runReset()}
                className="shrink-0"
                autoFocus
              >
                {resetPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                ) : (
                  <AlertTriangle className="mr-1.5 size-3.5" aria-hidden />
                )}
                Confirm reset
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={resetPending}
                onClick={disarmReset}
                className="shrink-0"
              >
                Cancel
              </Button>
              <span className="text-xs text-muted-foreground">
                Auto-cancels in {Math.round(REARM_TIMEOUT_MS / 1000)}s.
              </span>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
