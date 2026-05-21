'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogOut, Settings, Shield, UserRound } from 'lucide-react'
import { isAdminEmail } from '@coup-online/protocol'
import { GildedName } from '@/components/gilded-name'
import { PatronBadge } from '@/components/patron-badge'
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  Navbar,
  NavBody,
  NavItems,
} from '@/components/ui/resizable-navbar'
import { Logo } from '@/components/logo'
import { NavAccountMenu } from '@/components/nav-account-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { signOut, useSession } from '@/lib/auth-client'
import { useSignInPopup } from '@/lib/use-sign-in'
import { cn } from '@/lib/utils'

// Global site navbar — the scroll-aware bar from components/ui/resizable-navbar
// composed with this app's brand, links and signed-in identity. Rendered by
// app/(site)/layout.tsx; the game room and sign-in sit outside that route
// group, so they stay chrome-free. references/design-system.md.

// The top-level nav links — all public. Profile and Settings are NOT here:
// once signed in they live behind the account pill (NavAccountMenu) on
// desktop, and in the mobile menu's account section.
const PUBLIC_LINKS = [
  { name: 'Home', link: '/' },
  { name: 'Play', link: '/play' },
  { name: 'Rules', link: '/rules' },
  { name: 'Leaderboard', link: '/leaderboard' },
]

export function SiteNavbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const user = session?.user
  const [mobileOpen, setMobileOpen] = useState(false)
  const openSignIn = useSignInPopup()

  // The signed-in user's own profile page — linked from the account menu.
  const profileHref = user ? `/profile/${user.id}` : '/profile'
  // Discreet admin entry — only rendered for the allow-listed email(s).
  // Server-side gates re-verify on /admin and /api/admin/* so this is purely
  // a UI courtesy, not a security boundary.
  const isAdmin = isAdminEmail(user?.email ?? null)
  // Patron decoration for the account pill. Fetched on mount (the client
  // session doesn't carry patron columns). Defaults render the pill as
  // plain — no patron flicker for non-patrons. The async IIFE + try/catch
  // shape is on purpose: a bare `.then().catch()` chain still leaks an
  // AbortError to Next.js' dev overlay during strict-mode double-mount.
  const [patron, setPatron] = useState<{
    isPatron: boolean
    founderRank: number | null
    gildedNickname: boolean
  }>({ isPatron: false, founderRank: null, gildedNickname: false })
  useEffect(() => {
    if (!user?.id) return
    const ctrl = new AbortController()
    void (async () => {
      try {
        const res = await fetch('/api/me/profile', {
          cache: 'no-store',
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          patron?: {
            isPatron: boolean
            founderRank: number | null
            gildedNickname: boolean
          }
        }
        if (json.patron) {
          setPatron({
            isPatron: json.patron.isPatron,
            founderRank: json.patron.founderRank,
            gildedNickname: json.patron.gildedNickname,
          })
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Other failures → non-patron defaults stay in place.
      }
    })()
    return () => ctrl.abort()
  }, [user?.id])
  const links = PUBLIC_LINKS

  // Resolve the active link here so NavItems only needs the matched href:
  // `/` matches exactly, every other route matches by path prefix.
  const activeLink = links.find((l) =>
    l.link === '/' ? pathname === '/' : pathname.startsWith(l.link),
  )?.link

  // `||` (not `??`) so an empty-string provider name (common for magic-link
  // sign-ups) falls through to the email prefix.
  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0]?.trim() || 'Player'

  const handleSignOut = () =>
    void signOut({ fetchOptions: { onSuccess: () => router.push('/') } })

  return (
    <Navbar>
      {/* Desktop */}
      <NavBody>
        <Link
          href="/"
          aria-label="Coup Online — home"
          className="relative z-20 shrink-0 transition-opacity hover:opacity-80"
        >
          <Logo size="sm" />
        </Link>

        <NavItems items={links} activeLink={activeLink} />

        <div className="relative z-20 flex shrink-0 items-center gap-1">
          {isPending ? null : user ? (
            <NavAccountMenu
              displayName={displayName}
              image={user.image}
              profileHref={profileHref}
              isAdmin={isAdmin}
              isPatron={patron.isPatron}
              founderRank={patron.founderRank}
              gildedNickname={patron.gildedNickname}
              onSignOut={handleSignOut}
            />
          ) : (
            <Button size="sm" onClick={openSignIn}>
              Sign in
            </Button>
          )}
        </div>
      </NavBody>

      {/* Mobile */}
      <MobileNav>
        <MobileNavHeader>
          <Link
            href="/"
            aria-label="Coup Online — home"
            onClick={() => setMobileOpen(false)}
            className="transition-opacity hover:opacity-80"
          >
            <Logo size="sm" />
          </Link>
          <MobileNavToggle
            isOpen={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          />
        </MobileNavHeader>

        <MobileNavMenu isOpen={mobileOpen}>
          {links.map((l) => (
            <Link
              key={l.link}
              href={l.link}
              onClick={() => setMobileOpen(false)}
              aria-current={activeLink === l.link ? 'page' : undefined}
              className={cn(
                'w-full rounded-md px-3 py-2 text-sm font-medium transition-colors',
                activeLink === l.link
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {l.name}
            </Link>
          ))}

          <div className="h-px w-full bg-gold/30" />

          {isPending ? null : user ? (
            <div className="flex w-full flex-col gap-1">
              {/* Account header — avatar + name. */}
              <div className="flex items-center gap-2 px-3 py-1">
                <Avatar className="size-7">
                  <AvatarImage src={user.image ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <GildedName
                  name={displayName}
                  gilded={patron.gildedNickname}
                  dir="auto"
                  className="truncate text-sm font-medium"
                />
                <PatronBadge
                  isPatron={patron.isPatron}
                  founderRank={patron.founderRank}
                  size="xs"
                />
              </div>
              <Link
                href={profileHref}
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <UserRound className="size-4" aria-hidden />
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Settings className="size-4" aria-hidden />
                Settings
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <Shield className="size-4" aria-hidden />
                  Admin
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  handleSignOut()
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                setMobileOpen(false)
                openSignIn()
              }}
            >
              Sign in
            </Button>
          )}
        </MobileNavMenu>
      </MobileNav>
    </Navbar>
  )
}
