'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type {
  Action,
  BlockerCharacter,
  CardKind,
  PlayerView,
  ServerMessage,
} from '@coup-online/protocol'
import { Logo } from '@/components/logo'
import { SeatCard } from '@/components/seat-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GAME_SERVER_WS } from '@/lib/config'
import { logger } from '@/lib/logger'
import { useIsClient } from '@/lib/use-is-client'
import { WsClient, type ConnectionState } from '@/lib/ws-client'

// Minimal but-complete game UI. Shows the PlayerView, dispatches every action /
// challenge / block / influence-pick / exchange-pick / start-game via the
// WebSocket. WsClient auto-reconnects on transient drops; the banner reflects
// `connStatus` so a network blip doesn't blow away the in-progress view.

interface LobbyState {
  readonly kind: 'lobby'
  readonly hostPlayerId: string
  readonly players: ReadonlyArray<{ playerId: string; displayName: string }>
  readonly minPlayersToStart: number
  readonly maxPlayers: number
  readonly canStart: boolean
}
interface GameStateUi {
  readonly kind: 'game'
  readonly view: PlayerView
}
interface OverState {
  readonly kind: 'over'
  readonly winnerPlayerId: string
  readonly view: PlayerView
}
type UiState = LobbyState | GameStateUi | OverState | null

// SCREAMING_SNAKE phase → human label, e.g. CHALLENGE_WINDOW → "Challenge window".
function prettyPhase(phase: PlayerView['phase']): string {
  const lower = phase.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// Full-viewport centered shell for the loading / error / no-token screens.
function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <Logo size="md" />
      {children}
    </main>
  )
}

export function RoomClient({
  matchId,
  myPlayerId,
}: {
  matchId: string
  // Pulled from the Better Auth session on the server side (room/page.tsx) and
  // passed in. Used only for client-side UI checks (am I the host? show kick
  // buttons?). The WS handshake is gated by the JWT, not this value.
  myPlayerId: string
}) {
  // useIsClient = false during SSR + first client render (matching SSR HTML),
  // then true after hydration. This prevents the SSR/CSR mismatch that arises
  // from sessionStorage being null on the server but populated on the client.
  // See lib/use-is-client.ts.
  const isClient = useIsClient()
  const token =
    isClient && typeof window !== 'undefined'
      ? window.sessionStorage.getItem(`coup-online:token:${matchId}`)
      : null
  const [state, setState] = useState<UiState>(null)
  // Fatal errors (non-recoverable connection close, missing token, etc.).
  // These replace the page with a "Back to lobby" affordance.
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [connStatus, setConnStatus] = useState<ConnectionState>('connecting')
  // Exchange-pick: 4 cards arrive via a private `prompt` message addressed to
  // the actor only. Reset on phase exit and on game-end.
  const [exchangeCards, setExchangeCards] = useState<readonly CardKind[] | null>(null)
  const wsRef = useRef<WsClient | null>(null)

  useEffect(() => {
    if (!token) return
    const url = `${GAME_SERVER_WS}/api/ws?matchId=${encodeURIComponent(matchId)}&token=${encodeURIComponent(token)}`
    const ws = new WsClient({
      url,
      reconnect: { enabled: true },
      onMessage(msg: ServerMessage) {
        switch (msg.type) {
          case 'lobby-update':
            setState({
              kind: 'lobby',
              hostPlayerId: msg.hostPlayerId,
              players: msg.players,
              minPlayersToStart: msg.minPlayersToStart,
              maxPlayers: msg.maxPlayers,
              canStart: msg.canStart,
            })
            break
          case 'state-update':
            setState({ kind: 'game', view: msg.view })
            if (msg.view.phase !== 'EXCHANGE_SELECTION') {
              setExchangeCards(null)
            }
            break
          case 'game-end':
            setState({ kind: 'over', winnerPlayerId: msg.winnerPlayerId, view: msg.finalView })
            setExchangeCards(null)
            break
          case 'error':
            // Server-sent action error. Transient — the game continues, this
            // is just feedback. A sonner toast auto-dismisses without shifting
            // the layout.
            toast.error(msg.message)
            break
          case 'rate-limit':
            logger.warn('rate limited by server', {
              retryAfterMs: msg.retryAfterMs,
            })
            break
          case 'prompt':
            // SKILL.md § 3.2 phase 7 — private 4-card pool addressed only to
            // the Ambassador actor. Influence-pick prompt is unused in v1
            // (the actor already sees their own face-down kinds via the
            // PlayerView slice).
            if (msg.prompt.kind === 'exchange-pick') {
              setExchangeCards(msg.prompt.cards)
            }
            break
          case 'chat':
            // Lobby chat isn't rendered yet — debug-log receipt for now.
            logger.debug('lobby chat received', { fromPlayerId: msg.fromPlayerId })
            break
        }
      },
      onStateChange(next) {
        setConnStatus(next)
      },
      onClose(code, _reason, willReconnect) {
        // Only surface as a hard error when reconnect won't be attempted AND
        // it isn't a clean shutdown (1000). 4001-4003 are app-level denials
        // that should surface; transient codes become reconnect attempts.
        if (willReconnect) return
        if (code === 1000) return
        const labelByCode: Record<number, string> = {
          4001: 'Invalid or expired session token',
          4002: 'This match is full',
          4003: 'Match already in progress',
          4004: 'You were kicked by the host',
        }
        setError(labelByCode[code] ?? `Connection closed (code ${code})`)
      },
      onError() {
        // Most errors are followed by a close event — defer error UX to
        // onClose so we don't double-show. Just record that it happened.
        logger.warn('websocket error event')
      },
    })
    wsRef.current = ws

    // Tick clock for timer countdown display.
    const tick = setInterval(() => setNow(Date.now()), 250)

    return () => {
      clearInterval(tick)
      ws.close()
    }
  }, [matchId, token])

  const send = (msg: Parameters<WsClient['send']>[0]) => wsRef.current?.send(msg)

  // SSR + initial client render share this stable placeholder so hydration
  // doesn't mismatch.
  if (!isClient) {
    return (
      <CenteredShell>
        <p className="text-sm text-muted-foreground">Connecting…</p>
      </CenteredShell>
    )
  }

  if (!token) {
    return (
      <CenteredShell>
        <Alert>
          <AlertTitle>No token in this tab</AlertTitle>
          <AlertDescription>
            Go back to the lobby to create or join a match.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/">Back to lobby</Link>
        </Button>
      </CenteredShell>
    )
  }

  if (error) {
    return (
      <CenteredShell>
        <Alert variant="destructive">
          <AlertTitle>Disconnected</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/">Back to lobby</Link>
        </Button>
      </CenteredShell>
    )
  }
  if (!state) {
    return (
      <CenteredShell>
        <p className="text-sm text-muted-foreground">
          {connStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </p>
      </CenteredShell>
    )
  }

  const copyJoinLink = () => {
    // Copy the full URL so the recipient can click straight into the match.
    // window.location.origin picks up the scheme (http in dev, https in prod).
    const link = `${window.location.origin}/room/${encodeURIComponent(matchId)}`
    void window.navigator.clipboard.writeText(link)
    toast.success('Join link copied to clipboard')
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <Logo size="sm" />
        <Button asChild variant="ghost" size="sm">
          <Link href="/">Leave</Link>
        </Button>
      </header>

      {connStatus !== 'open' && (
        <div className="mb-4 rounded-md border border-gold/45 bg-gold/10 px-3 py-1.5 text-sm text-gold-foreground">
          {connStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border bg-card/70 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">Match code</span>
          <span
            dir="ltr"
            className="truncate rounded bg-secondary px-2 py-0.5 font-mono tracking-[0.15em] text-secondary-foreground"
          >
            {matchId}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={copyJoinLink}>
          <Copy />
          Copy link
        </Button>
      </div>

      {state.kind === 'lobby' && (
        <LobbyPanel state={state} myPlayerId={myPlayerId} send={send} />
      )}
      {state.kind === 'game' && (
        <GamePanel
          view={state.view}
          now={now}
          send={send}
          exchangeCards={exchangeCards}
        />
      )}
      {state.kind === 'over' && (
        <OverPanel winnerPlayerId={state.winnerPlayerId} view={state.view} />
      )}
    </main>
  )
}

function LobbyPanel({
  state,
  myPlayerId,
  send,
}: {
  state: LobbyState
  myPlayerId: string
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  const count = state.players.length
  const remaining = Math.max(0, state.minPlayersToStart - count)
  const seatsLeft = Math.max(0, state.maxPlayers - count)
  const iAmHost = state.hostPlayerId === myPlayerId
  let statusLine: string
  if (remaining > 0) {
    statusLine = `Waiting for ${remaining} more player${remaining === 1 ? '' : 's'}…`
  } else if (seatsLeft > 0) {
    statusLine = `Ready to start. ${seatsLeft} more seat${seatsLeft === 1 ? '' : 's'} available.`
  } else {
    statusLine = 'Lobby full. Ready to start.'
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg tracking-wide">Lobby</h2>
          <span className="text-sm text-muted-foreground">
            {count}/{state.maxPlayers} players
          </span>
        </div>

        <p className="text-sm text-muted-foreground">{statusLine}</p>

        <ul className="flex flex-col gap-1.5">
          {state.players.map((p) => {
            const isHost = p.playerId === state.hostPlayerId
            const isMe = p.playerId === myPlayerId
            return (
              <li
                key={p.playerId}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span dir="auto" className="truncate font-medium">
                    {p.displayName}
                  </span>
                  {isMe && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                  {isHost && (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-gold/50 text-gold-foreground"
                    >
                      host
                    </Badge>
                  )}
                </span>
                {iAmHost && !isMe && (
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={() => send({ type: 'kick', playerId: p.playerId })}
                  >
                    Kick
                  </Button>
                )}
              </li>
            )
          })}
        </ul>

        <Button
          variant="success"
          size="lg"
          className="w-full"
          onClick={() => send({ type: 'start-game' })}
          disabled={!iAmHost || !state.canStart}
        >
          Start game ({count}/{state.maxPlayers})
        </Button>
        <p className="text-xs text-muted-foreground">
          {iAmHost
            ? `You are the host. Press Start when ${state.minPlayersToStart}–${state.maxPlayers} players have joined.`
            : 'Waiting for the host to start the match.'}
        </p>
      </CardContent>
    </Card>
  )
}

function GamePanel({
  view,
  now,
  send,
  exchangeCards,
}: {
  view: PlayerView
  now: number
  send: (msg: Parameters<WsClient['send']>[0]) => void
  exchangeCards: readonly CardKind[] | null
}) {
  const me = view.seats.find((s) => s.isMe)
  const isMyTurn = view.turnPlayerId === view.myPlayerId
  // Eliminated-but-still-connected: the player keeps watching with the same
  // public-info view (SKILL.md § 1) — we just suppress the action bars and
  // show a spectator notice so a dead player isn't staring at dead buttons.
  const amSpectating = me != null && !me.isAlive
  const timerSeconds =
    view.timerEndsAt != null ? Math.max(0, Math.ceil((view.timerEndsAt - now) / 1000)) : null
  const turnName =
    view.seats.find((s) => s.playerId === view.turnPlayerId)?.displayName ?? '—'

  return (
    <section className="flex flex-col gap-4">
      {amSpectating && (
        <Alert>
          <AlertTitle>You&rsquo;ve been eliminated</AlertTitle>
          <AlertDescription>
            You&rsquo;re now spectating. The match continues for the remaining
            players.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Phase</span>
            <span className="font-display tracking-wide">{prettyPhase(view.phase)}</span>
            {timerSeconds != null && (
              <Badge variant={timerSeconds <= 5 ? 'destructive' : 'secondary'}>
                {timerSeconds}s
              </Badge>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Turn</span>{' '}
            <span dir="auto" className="font-medium">
              {turnName}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Court deck</span>{' '}
            {view.courtDeck.count} card{view.courtDeck.count === 1 ? '' : 's'}
          </div>
          {view.pendingAction && <PendingActionLine view={view} pa={view.pendingAction} />}
          {view.pendingBlock && (
            <div>
              <span className="text-muted-foreground">Block claim</span>{' '}
              <span dir="auto">
                {
                  view.seats.find((s) => s.playerId === view.pendingBlock!.blockerPlayerId)
                    ?.displayName
                }
              </span>{' '}
              → {view.pendingBlock.claimedCharacter}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {view.seats.map((seat) => (
          <SeatCard
            key={seat.playerId}
            seat={seat}
            isTurn={seat.playerId === view.turnPlayerId}
          />
        ))}
      </div>

      {/* Action / challenge / block bars are gated by phase + role here so the
          server rarely sees an action it has to reject. Server is still
          authoritative — these gates exist to reduce error-toast noise. */}
      {view.phase === 'AWAITING_ACTION' && me?.isAlive && (
        <ActionBar view={view} me={me} isMyTurn={isMyTurn} send={send} />
      )}

      {(view.phase === 'CHALLENGE_WINDOW' || view.phase === 'BLOCK_CHALLENGE_WINDOW') &&
        me?.isAlive && <ChallengeBar view={view} send={send} />}

      {view.phase === 'BLOCK_WINDOW' && me?.isAlive && (
        <BlockBar view={view} send={send} />
      )}

      {view.phase === 'INFLUENCE_LOSS' && (
        <InfluenceLossSection view={view} me={me ?? null} send={send} />
      )}

      {view.phase === 'EXCHANGE_SELECTION' && isMyTurn && exchangeCards && (
        <ExchangeBar cards={exchangeCards} send={send} />
      )}
      {view.phase === 'EXCHANGE_SELECTION' && isMyTurn && !exchangeCards && (
        <p className="text-sm text-muted-foreground">Waiting for exchange prompt…</p>
      )}
      {view.phase === 'EXCHANGE_SELECTION' && !isMyTurn && (
        <p className="text-sm text-muted-foreground">
          <span dir="auto">{turnName}</span> is picking exchange cards…
        </p>
      )}
    </section>
  )
}

function PendingActionLine({
  view,
  pa,
}: {
  view: PlayerView
  pa: NonNullable<PlayerView['pendingAction']>
}) {
  const actor = view.seats.find((s) => s.playerId === pa.actorPlayerId)?.displayName ?? '?'
  const action = pa.action
  const targetId = 'targetPlayerId' in action ? action.targetPlayerId : null
  const targetName = targetId
    ? (view.seats.find((s) => s.playerId === targetId)?.displayName ?? '?')
    : null
  return (
    <div>
      <span className="text-muted-foreground">Pending</span>{' '}
      <span dir="auto">{actor}</span> → {action.kind}
      {targetName && (
        <>
          {' '}
          (target: <span dir="auto">{targetName}</span>)
        </>
      )}
    </div>
  )
}

type ButtonVariant = React.ComponentProps<typeof Button>['variant']

interface AffordedButtonProps {
  readonly label: string
  readonly disabledReason: string | null
  readonly onClick: () => void
  readonly variant?: ButtonVariant
}

// A button that, when disabled, explains why via a Radix tooltip. A disabled
// <button> emits no pointer events, so the tooltip hangs off a <span> wrapper.
function AffordedButton({ label, disabledReason, onClick, variant = 'secondary' }: AffordedButtonProps) {
  const disabled = disabledReason !== null
  const button = (
    <Button variant={variant} size="sm" onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  )
  if (!disabled) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  )
}

function ActionBar({
  view,
  me,
  isMyTurn,
  send,
}: {
  view: PlayerView
  me: PlayerView['seats'][number]
  isMyTurn: boolean
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  const [target, setTarget] = useState<string>('')
  const aliveOthers = view.seats.filter((s) => !s.isMe && s.isAlive)

  const act = (a: Action) => send({ type: 'action', action: a })

  // ActionBar only renders for a living `me` (gated by the parent), so the
  // sole turn-gating reason left is "not your turn".
  const turnReason = isMyTurn
    ? null
    : `It is ${view.seats.find((s) => s.playerId === view.turnPlayerId)?.displayName ?? '?'}'s turn.`
  const mustCoupReason = me.coins >= 10 ? '10+ coins — you must Coup.' : null
  const targetReason = target.length === 0 ? 'Select a target first.' : null
  const faceDownCount = me.influence.filter((i) => i.status === 'face-down').length
  const exchangeFaceDownReason =
    faceDownCount === 2 ? null : 'Exchange requires 2 face-down cards (v1 limitation).'

  const cantAfford = (cost: number) =>
    me.coins < cost ? `Need ${cost} coins (you have ${me.coins}).` : null

  // Reasons stack from most general to most specific so the first non-null is
  // the one most useful for the user.
  const incomeReason = turnReason ?? mustCoupReason
  const fAidReason = incomeReason
  const taxReason = incomeReason
  const exchangeReason = incomeReason ?? exchangeFaceDownReason
  const coupReason = turnReason ?? cantAfford(7) ?? targetReason
  const assassinateReason = turnReason ?? mustCoupReason ?? cantAfford(3) ?? targetReason
  const stealReason = turnReason ?? mustCoupReason ?? targetReason

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <AffordedButton
            label="Income +1"
            disabledReason={incomeReason}
            onClick={() => act({ kind: 'Income' })}
          />
          <AffordedButton
            label="Foreign Aid +2"
            disabledReason={fAidReason}
            onClick={() => act({ kind: 'ForeignAid' })}
          />
          <AffordedButton
            label="Tax +3 · Duke"
            disabledReason={taxReason}
            onClick={() => act({ kind: 'Tax' })}
          />
          <AffordedButton
            label="Exchange · Ambassador"
            disabledReason={exchangeReason}
            onClick={() => act({ kind: 'Exchange' })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="min-w-44" aria-label="Target player">
              <SelectValue placeholder="Choose a target" />
            </SelectTrigger>
            <SelectContent>
              {aliveOthers.map((s) => (
                <SelectItem key={s.playerId} value={s.playerId}>
                  {s.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AffordedButton
            label="Coup −7"
            variant="default"
            disabledReason={coupReason}
            onClick={() => target && act({ kind: 'Coup', targetPlayerId: target })}
          />
          <AffordedButton
            label="Assassinate −3 · Assassin"
            variant="destructive"
            disabledReason={assassinateReason}
            onClick={() => target && act({ kind: 'Assassinate', targetPlayerId: target })}
          />
          <AffordedButton
            label="Steal · Captain"
            disabledReason={stealReason}
            onClick={() => target && act({ kind: 'Steal', targetPlayerId: target })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// Renders the Challenge button with role-aware disabling. Hidden entirely for
// dead players (gated by the parent).
function ChallengeBar({
  view,
  send,
}: {
  view: PlayerView
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  let reason: string | null = null
  if (view.phase === 'CHALLENGE_WINDOW') {
    if (view.pendingAction?.actorPlayerId === view.myPlayerId) {
      reason = 'You declared this action — you cannot challenge yourself.'
    }
  } else {
    // BLOCK_CHALLENGE_WINDOW
    if (view.pendingBlock?.blockerPlayerId === view.myPlayerId) {
      reason = 'You declared this block — you cannot challenge yourself.'
    }
  }
  return (
    <Card>
      <CardContent>
        <AffordedButton
          label="Challenge"
          variant="destructive"
          disabledReason={reason}
          onClick={() => send({ type: 'challenge' })}
        />
      </CardContent>
    </Card>
  )
}

function BlockBar({
  view,
  send,
}: {
  view: PlayerView
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  const pa = view.pendingAction
  if (!pa) return null
  // Eligibility rules per SKILL.md § 4.5:
  //   ForeignAid → any other living player may claim Duke
  //   Steal     → only the target may claim Captain or Ambassador
  //   Assassinate → only the target may claim Contessa
  // The acting player can never block their own action.
  if (pa.actorPlayerId === view.myPlayerId) return null

  let candidates: ReadonlyArray<BlockerCharacter> = []
  let restrictedToTarget = false
  switch (pa.action.kind) {
    case 'ForeignAid':
      candidates = ['Duke']
      break
    case 'Steal':
      candidates = ['Captain', 'Ambassador']
      restrictedToTarget = true
      break
    case 'Assassinate':
      candidates = ['Contessa']
      restrictedToTarget = true
      break
    default:
      return null
  }

  if (restrictedToTarget && 'targetPlayerId' in pa.action) {
    if (pa.action.targetPlayerId !== view.myPlayerId) return null
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap gap-2">
        {candidates.map((c) => (
          <Button
            key={c}
            variant="secondary"
            size="sm"
            onClick={() => send({ type: 'block', claimedCharacter: c })}
          >
            Block with {c}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

function InfluenceLossSection({
  view,
  me,
  send,
}: {
  view: PlayerView
  me: PlayerView['seats'][number] | null
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  const picker = view.influenceLossPlayerId
  if (picker == null) return null
  if (me && picker === view.myPlayerId) {
    return <InfluencePickBar me={me} send={send} />
  }
  const pickerName = view.seats.find((s) => s.playerId === picker)?.displayName ?? '?'
  return (
    <p className="text-sm text-muted-foreground">
      <span dir="auto">{pickerName}</span> is choosing a card to reveal…
    </p>
  )
}

function InfluencePickBar({
  me,
  send,
}: {
  me: PlayerView['seats'][number]
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm font-medium">Choose a card to reveal:</p>
        <div className="flex flex-wrap gap-2">
          {me.influence.map((inf, i) =>
            inf.status === 'face-down' ? (
              <Button
                key={i}
                variant="destructive"
                size="sm"
                onClick={() => send({ type: 'influence-pick', cardIndex: i })}
              >
                Reveal {inf.kind}
              </Button>
            ) : null,
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ExchangeBar({
  cards,
  send,
}: {
  cards: readonly CardKind[]
  send: (msg: Parameters<WsClient['send']>[0]) => void
}) {
  const [selected, setSelected] = useState<number[]>([])
  const toggle = (i: number) => {
    if (selected.includes(i)) {
      setSelected(selected.filter((s) => s !== i))
    } else if (selected.length < 2) {
      setSelected([...selected, i])
    }
  }
  const submit = () => {
    if (selected.length !== 2) return
    send({ type: 'exchange-pick', keepIndices: [selected[0], selected[1]] })
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          Choose 2 cards to keep — the other 2 return to the Court Deck:
        </p>
        <div className="flex flex-wrap gap-2">
          {cards.map((c, i) => (
            <Button
              key={i}
              variant={selected.includes(i) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggle(i)}
            >
              {c}
            </Button>
          ))}
        </div>
        <Button
          variant="success"
          size="sm"
          className="w-fit"
          onClick={submit}
          disabled={selected.length !== 2}
        >
          Keep selected ({selected.length}/2)
        </Button>
      </CardContent>
    </Card>
  )
}

// English ordinal: 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th"…
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function OverPanel({ winnerPlayerId, view }: { winnerPlayerId: string; view: PlayerView }) {
  const winner = view.seats.find((s) => s.playerId === winnerPlayerId)
  // Final standings: the survivor first, then eliminated players ranked by
  // reverse elimination order (last eliminated = runner-up). Mirrors the
  // server's computeFinishingPositions() so the displayed placement matches
  // the rating update.
  const standings = [
    ...view.seats.filter((s) => s.eliminationOrder == null),
    ...view.seats
      .filter((s) => s.eliminationOrder != null)
      .sort((a, b) => (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0)),
  ]
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
            Game over
          </span>
          <h2 className="font-display text-2xl tracking-wide">
            {winner?.isMe ? 'You won!' : `${winner?.displayName ?? '?'} won`}
          </h2>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Final standings
          </h3>
          <ol className="flex flex-col gap-1.5">
            {standings.map((s, i) => (
              <li
                key={s.playerId}
                className={
                  i === 0
                    ? 'flex items-center justify-between gap-3 rounded-md border border-gold/55 bg-gold/10 px-3 py-2 text-sm'
                    : 'flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm'
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-5 shrink-0 text-center font-display tabular-nums">
                    {i + 1}
                  </span>
                  <span dir="auto" className="truncate font-medium">
                    {s.displayName}
                  </span>
                  {s.isMe && (
                    <span className="shrink-0 text-xs text-muted-foreground">(you)</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {i === 0 ? 'winner' : `${ordinal(i + 1)} place`}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <Button asChild size="lg" className="w-full">
          <Link href="/">Play again</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
