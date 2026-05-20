'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogOut, Settings, Shield, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// The signed-in account control in the desktop navbar — the avatar + name
// pill. It is the single entry point to the account: hovering or clicking it
// opens a small menu with Profile, Settings and Sign out (Profile is no
// longer a top-level nav link). Closes on mouse-leave, click-outside, Escape,
// or picking an item.
//
// `isAdmin` is computed by the parent (SiteNavbar) using `isAdminEmail` from
// `@coup-online/protocol`. When true, an extra "Admin" item appears between
// Settings and the Sign-out separator. The page at /admin and the
// /api/admin/* endpoints both re-verify admin status server-side, so showing
// this entry to a non-admin would still produce a 404 — but we hide it
// anyway to keep the menu uncluttered for ordinary users.

const CLOSE_DELAY_MS = 140

interface NavAccountMenuProps {
  displayName: string
  image: string | null | undefined
  profileHref: string
  isAdmin: boolean
  onSignOut: () => void
}

export function NavAccountMenu({
  displayName,
  image,
  profileHref,
  isAdmin,
  onSignOut,
}: NavAccountMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  // Delayed close so the cursor can cross the small gap from pill to panel
  // without the menu snapping shut.
  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }

  // While open: dismiss on click-outside or Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => cancelClose, [])

  const itemClass =
    'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent/60'

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose()
        setOpen(true)
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2 rounded-full border bg-card/70 p-1 pr-3 transition-colors hover:bg-accent/60 aria-expanded:bg-accent/60"
      >
        <Avatar className="size-7">
          <AvatarImage src={image ?? undefined} alt="" />
          <AvatarFallback className="text-xs">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span dir="auto" className="max-w-[9rem] truncate text-sm font-medium">
          {displayName}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-50 mt-2 flex w-44 flex-col rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={profileHref}
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <UserRound className="size-4" aria-hidden />
            Profile
          </Link>
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Settings className="size-4" aria-hidden />
            Settings
          </Link>
          {isAdmin && (
            <Link
              role="menuitem"
              href="/admin"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <Shield className="size-4" aria-hidden />
              Admin
            </Link>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className={`${itemClass} cursor-pointer text-left`}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
