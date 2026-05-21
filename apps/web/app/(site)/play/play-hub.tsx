'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { KeyRound, Plus, Sparkles, Swords } from 'lucide-react'
import { MOTION_ENABLED, NO_REDUCED_MOTION } from '@/components/motion'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession } from '@/lib/auth-client'
import { generateMatchCode, parseMatchCode } from '@/lib/match-code'
import { useSignInPopup } from '@/lib/use-sign-in'

// The play hub — header + the three ways into a game, with a GSAP entrance
// where the cards are "dealt" onto the table.
//
//   • Quick match — ranked matchmaking. The MatchmakingQueue DO is still a
//     stub (501), so this card is informational ("coming soon"), not wired.
//   • Create a match — mints a fresh room code client-side → /room/[code].
//   • Join a match — same, from a pasted code or invite link.
//
// The cards render for everyone so the layout (and its animation) is stable;
// SKILL.md § 1 (no guest play) is enforced at the action — a signed-out click
// opens the sign-in popup instead of routing.
//
// Motion (one useGSAP, gated on gsap.matchMedia()): the header reveals, then
// the cards drop and rotate into place with a settle overshoot, then their
// icon medallions pop. references/animations.md.
export function PlayHub() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const openSignIn = useSignInPopup()
  const [matchCode, setMatchCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!MOTION_ENABLED) return
      const el = ref.current
      if (!el) return
      const q = gsap.utils.selector(el)
      const mm = gsap.matchMedia()
      mm.add(NO_REDUCED_MOTION, () => {
        gsap
          .timeline({ defaults: { ease: 'power3.out' } })
          .from(q('[data-play="kicker"]'), {
            y: -22,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
          })
          .from(
            q('[data-play="title"]'),
            { y: 26, opacity: 0, duration: 0.55 },
            '-=0.25',
          )
          .from(
            q('[data-ornament]'),
            { scaleX: 0, opacity: 0, duration: 0.5, ease: 'power2.out' },
            '-=0.25',
          )
          .from(
            q('[data-play="lede"]'),
            { y: 16, opacity: 0, duration: 0.5 },
            '-=0.3',
          )
          // The cards, dealt onto the table — drop in rotated, with a settle.
          .from(
            q('[data-play-card]'),
            {
              y: -58,
              rotation: (i: number) => (i % 2 === 0 ? -9 : 7),
              scale: 0.82,
              opacity: 0,
              transformOrigin: '50% 50%',
              duration: 0.6,
              stagger: 0.13,
              ease: 'back.out(1.5)',
            },
            '-=0.1',
          )
          // …then the icon medallions pop once each card has landed.
          .from(
            q('[data-play-icon]'),
            {
              scale: 0,
              opacity: 0,
              duration: 0.4,
              stagger: 0.1,
              ease: 'back.out(2.2)',
            },
            '-=0.3',
          )
      })
      return () => mm.revert()
    },
    { scope: ref },
  )

  const user = session?.user
  const canJoin = !busy && parseMatchCode(matchCode).length > 0

  // Patron vanity room code — fetched on mount from /api/me/profile (the
  // session client doesn't carry patron columns). Null while loading, the
  // code while available, '' if the patron hasn't set one. Non-patrons stay
  // at null and never see the extra CTA. The async IIFE + try/catch shape is
  // here on purpose: a bare `.then().catch()` chain still leaks the
  // AbortError to Next.js' dev overlay during strict-mode double-mount,
  // because the rejection traverses two microtasks before the .catch runs.
  // Awaiting inside try/catch lets us classify the rejection exactly once.
  const [vanityCode, setVanityCode] = useState<string | null>(null)
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
          patron?: { isPatron: boolean; vanityRoomCode: string | null }
        }
        if (json.patron?.isPatron && json.patron.vanityRoomCode) {
          setVanityCode(json.patron.vanityRoomCode)
        }
      } catch (err) {
        // AbortError on unmount / dependency change is expected.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Network or parse failure → non-patron defaults stand.
      }
    })()
    return () => ctrl.abort()
  }, [user?.id])

  function handleCreate(code?: string) {
    if (isPending) return
    if (!user) {
      openSignIn()
      return
    }
    setBusy(true)
    const target =
      code && parseMatchCode(code).length > 0
        ? parseMatchCode(code)
        : generateMatchCode()
    router.push(`/room/${encodeURIComponent(target)}`)
  }

  function handleJoin() {
    if (isPending) return
    const id = parseMatchCode(matchCode)
    if (id.length === 0) return
    if (!user) {
      openSignIn()
      return
    }
    setBusy(true)
    router.push(`/room/${encodeURIComponent(id)}`)
  }

  async function handlePaste() {
    try {
      const text = await window.navigator.clipboard.readText()
      setMatchCode(parseMatchCode(text))
    } catch {
      setError('Could not read clipboard. Paste with Ctrl+V instead.')
    }
  }

  return (
    <div ref={ref} className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <p
          data-play="kicker"
          className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase"
        >
          Take a seat
        </p>
        <h1
          data-play="title"
          className="font-display text-3xl tracking-wide sm:text-4xl"
        >
          Play Coup
        </h1>
        <OrnamentDivider className="w-44 max-w-[70%] text-gold/60" />
        <p data-play="lede" className="text-sm text-muted-foreground">
          Start a private table, or join one with a code.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {/* Quick match — matchmaking DO not built yet, so this is informational. */}
        <Card data-play-card className="border border-dashed border-gold/40">
          <CardContent className="flex items-center gap-4">
            <span
              data-play-icon
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold"
            >
              <Swords className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg tracking-wide">
                  Quick match
                </h2>
                <span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
                  Coming soon
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Ranked matchmaking — we&rsquo;ll seat you with players near your
                rating.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Create a private match. */}
          <Card data-play-card>
            <CardContent className="flex flex-1 flex-col gap-3">
              <span
                data-play-icon
                className="flex size-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold"
              >
                <Plus className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-lg tracking-wide">
                  Create a match
                </h2>
                <p className="text-sm text-muted-foreground">
                  Start a private table and share the code with 2&ndash;5
                  friends.
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-2">
                {vanityCode && (
                  <>
                    {/* Patron primary CTA — uses the saved vanity code. */}
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => handleCreate(vanityCode)}
                      disabled={busy}
                    >
                      <Sparkles className="mr-1.5 size-4" aria-hidden />
                      Create with {vanityCode}
                    </Button>
                    {/* Fallback: random code. */}
                    <button
                      type="button"
                      onClick={() => handleCreate()}
                      disabled={busy}
                      className="cursor-pointer text-center text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      or use a random code
                    </button>
                  </>
                )}
                {!vanityCode && (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => handleCreate()}
                    disabled={busy}
                  >
                    Create match
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Join an existing match by code. */}
          <Card data-play-card>
            <CardContent className="flex flex-1 flex-col gap-3">
              <span
                data-play-icon
                className="flex size-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold"
              >
                <KeyRound className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-lg tracking-wide">
                  Join a match
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter a code, or paste an invite link.
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-2">
                <Label htmlFor="match-code" className="sr-only">
                  Match code
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="match-code"
                    dir="auto"
                    value={matchCode}
                    onChange={(e) => setMatchCode(e.target.value)}
                    onPaste={(e) => {
                      // Normalize a pasted /room/<code> link into the code.
                      e.preventDefault()
                      setMatchCode(
                        parseMatchCode(e.clipboardData.getData('text')),
                      )
                    }}
                    placeholder="paste code or link"
                    className="uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePaste()}
                  >
                    Paste
                  </Button>
                </div>
                <Button
                  variant="success"
                  size="lg"
                  className="w-full"
                  onClick={handleJoin}
                  disabled={!canJoin}
                >
                  Join match
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {!isPending && !user && (
          <p className="text-center text-xs text-muted-foreground">
            You&rsquo;ll be asked to sign in before the match starts.
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
