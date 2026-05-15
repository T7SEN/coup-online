'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type {
  Action,
  BlockerCharacter,
  CardKind,
  PlayerView,
  ServerMessage,
} from '@coup-online/protocol'
import { GAME_SERVER_WS } from '@/lib/config'
import { getOrCreateUserId } from '@/lib/identity'
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

export function RoomClient({ matchId }: { matchId: string }) {
  // useIsClient = false during SSR + first client render (matching SSR HTML),
  // then true after hydration. This prevents the SSR/CSR mismatch that arises
  // from sessionStorage being null on the server but populated on the client.
  // See lib/use-is-client.ts.
  const isClient = useIsClient()
  const token =
    isClient && typeof window !== 'undefined'
      ? window.sessionStorage.getItem(`coup-online:token:${matchId}`)
      : null
  // userId is read post-hydration so the placeholder render doesn't touch
  // localStorage during SSR. The room API gates everything by JWT — this is
  // just for client-side UI checks (am I the host? show kick buttons?).
  const myPlayerId = isClient ? getOrCreateUserId() : ''
  const [state, setState] = useState<UiState>(null)
  // Fatal errors (non-recoverable connection close, missing token, etc.).
  // These replace the page with a "Back to lobby" affordance.
  const [error, setError] = useState<string | null>(null)
  // Transient server `error` messages (insufficient_coins, not_your_turn, …).
  // These show as an inline banner that auto-dismisses; the game UI stays
  // visible. Auto-clear keeps the most recent issue visible without piling up.
  const [transientError, setTransientError] = useState<string | null>(null)
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
            // is just feedback. Auto-dismiss after 4 s so a fresh action isn't
            // shadowed by stale text.
            setTransientError(`${msg.code}: ${msg.message}`)
            if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
            transientTimerRef.current = setTimeout(() => {
              setTransientError(null)
              transientTimerRef.current = null
            }, 4_000)
            break
          case 'rate-limit':
            console.warn('rate-limit', msg.retryAfterMs)
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
            console.log('chat', msg.fromPlayerId, msg.text)
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
        // Most errors are followed by a close event — defer error UX to onClose
        // so we don't double-show. The console retains the raw event.
        console.warn('WsClient error event')
      },
    })
    wsRef.current = ws

    // Tick clock for timer countdown display.
    const tick = setInterval(() => setNow(Date.now()), 250)

    return () => {
      clearInterval(tick)
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current)
        transientTimerRef.current = null
      }
      ws.close()
    }
  }, [matchId, token])

  const send = (msg: Parameters<WsClient['send']>[0]) => wsRef.current?.send(msg)

  // SSR + initial client render share this stable placeholder so hydration
  // doesn't mismatch.
  if (!isClient) {
    return <main className="mx-auto max-w-2xl p-8">Connecting…</main>
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="rounded border border-yellow-300 bg-yellow-50 p-3 text-yellow-800">
          No token in this tab. Go back to the lobby to create or join a match.
        </p>
        <Link href="/" className="mt-4 inline-block text-blue-600 underline">
          Back to lobby
        </Link>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="rounded border border-red-300 bg-red-50 p-3 text-red-700">{error}</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 underline">
          Back to lobby
        </Link>
      </main>
    )
  }
  if (!state) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        {connStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      {connStatus !== 'open' && (
        <p className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-2 text-sm text-yellow-800">
          {connStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </p>
      )}

      {transientError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          <span>{transientError}</span>
          <button
            onClick={() => setTransientError(null)}
            className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 hover:bg-red-200"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Match</h1>
        <Link href="/" className="text-sm text-blue-600 underline">
          Leave
        </Link>
      </div>

      <p className="mb-4 break-all rounded bg-gray-100 p-2 text-xs">
        <span className="font-medium">Code:</span> {matchId}{' '}
        <button
          onClick={() => {
            // Copy the full URL so the recipient can click straight into the
            // match. window.location.origin picks up the scheme (http: in dev,
            // https: in production).
            const url = `${window.location.origin}/room/${encodeURIComponent(matchId)}`
            void window.navigator.clipboard.writeText(url)
          }}
          className="ml-2 rounded bg-gray-300 px-2 py-0.5 hover:bg-gray-400"
          title="Copy the full join URL"
        >
          copy link
        </button>
      </p>

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
      {state.kind === 'over' && <OverPanel winnerPlayerId={state.winnerPlayerId} view={state.view} />}
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
  let startTooltip: string
  if (!iAmHost) {
    startTooltip = 'Only the host can start the match.'
  } else if (!state.canStart) {
    startTooltip = `Need at least ${state.minPlayersToStart} players (currently ${count}).`
  } else {
    startTooltip = 'Start the match for the current lobby.'
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg">{statusLine}</h2>
      <ul className="space-y-1">
        {state.players.map((p) => {
          const isHost = p.playerId === state.hostPlayerId
          const isMe = p.playerId === myPlayerId
          return (
            <li
              key={p.playerId}
              className="flex items-center justify-between rounded bg-gray-50 p-2 text-sm"
            >
              <span dir="auto">
                {p.displayName}
                {isMe && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                {isHost && (
                  <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    host
                  </span>
                )}
              </span>
              {iAmHost && !isMe && (
                <button
                  onClick={() => send({ type: 'kick', playerId: p.playerId })}
                  className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 hover:bg-red-200"
                  title={`Remove ${p.displayName} from the lobby`}
                >
                  kick
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <button
        onClick={() => send({ type: 'start-game' })}
        disabled={!iAmHost || !state.canStart}
        title={startTooltip}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
      >
        Start game ({count}/{state.maxPlayers})
      </button>
      <p className="text-xs text-gray-500">
        {iAmHost
          ? `You are the host. Press Start when ${state.minPlayersToStart}–${state.maxPlayers} players are joined.`
          : 'Waiting for the host to start the match.'}
      </p>
    </section>
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
  const timerSeconds =
    view.timerEndsAt != null ? Math.max(0, Math.ceil((view.timerEndsAt - now) / 1000)) : null

  return (
    <section>
      <div className="mb-4 rounded border border-gray-200 p-3">
        <div className="text-sm">
          <span className="font-medium">Phase:</span> {view.phase}
          {timerSeconds != null && <span className="ml-2 text-gray-500">({timerSeconds}s)</span>}
        </div>
        <div className="text-sm">
          <span className="font-medium">Turn:</span>{' '}
          {view.seats.find((s) => s.playerId === view.turnPlayerId)?.displayName ?? '—'}
        </div>
        <div className="text-sm">
          <span className="font-medium">Court deck:</span> {view.courtDeck.count} cards
        </div>
        {view.pendingAction && <PendingActionLine view={view} pa={view.pendingAction} />}
        {view.pendingBlock && (
          <div className="text-sm">
            <span className="font-medium">Block claim:</span>{' '}
            {view.seats.find((s) => s.playerId === view.pendingBlock!.blockerPlayerId)?.displayName}{' '}
            → {view.pendingBlock.claimedCharacter}
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-2 sm:grid-cols-2">
        {view.seats.map((seat) => (
          <div
            key={seat.playerId}
            className={`rounded border p-3 text-sm ${
              seat.playerId === view.turnPlayerId
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200'
            } ${!seat.isAlive ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span dir="auto" className="font-medium">
                {seat.displayName} {seat.isMe && <span className="text-xs text-gray-500">(you)</span>}
              </span>
              <span className="text-xs">
                {seat.coins} coin{seat.coins === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-1 flex gap-1">
              {seat.influence.map((inf, i) => (
                <span
                  key={i}
                  className={`rounded px-2 py-0.5 text-xs ${
                    inf.status === 'revealed'
                      ? 'bg-red-100 text-red-800 line-through'
                      : inf.status === 'face-down'
                        ? 'bg-gray-200'
                        : 'bg-gray-400 text-white'
                  }`}
                >
                  {inf.status === 'hidden' ? '???' : inf.kind}
                </span>
              ))}
              {seat.isDisconnected && (
                <span className="ml-1 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                  disconnected
                </span>
              )}
              {!seat.isAlive && (
                <span className="ml-1 rounded bg-red-200 px-2 py-0.5 text-xs">eliminated</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action / challenge / block bars are gated by phase + role here so the
          server rarely sees an action it has to reject. Server is still
          authoritative — these gates exist to reduce error-toast noise. */}
      {view.phase === 'AWAITING_ACTION' && me && (
        <ActionBar view={view} me={me} isMyTurn={isMyTurn} send={send} />
      )}

      {(view.phase === 'CHALLENGE_WINDOW' || view.phase === 'BLOCK_CHALLENGE_WINDOW') && me?.isAlive && (
        <ChallengeBar view={view} send={send} />
      )}

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
        <p className="text-sm text-gray-500">Waiting for exchange prompt…</p>
      )}
      {view.phase === 'EXCHANGE_SELECTION' && !isMyTurn && (
        <p className="text-sm text-gray-500">
          {view.seats.find((s) => s.playerId === view.turnPlayerId)?.displayName ?? '?'} is
          picking exchange cards…
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
    <div className="text-sm">
      <span className="font-medium">Pending:</span> {actor} → {action.kind}
      {targetName && ` (target: ${targetName})`}
    </div>
  )
}

interface AffordedButtonProps {
  readonly label: string
  readonly disabledReason: string | null
  readonly onClick: () => void
  readonly className: string
}

function AffordedButton({ label, disabledReason, onClick, className }: AffordedButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabledReason !== null}
      title={disabledReason ?? undefined}
      className={`${className} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
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

  const turnReason = isMyTurn
    ? me.isAlive
      ? null
      : 'You have been eliminated.'
    : `It is ${view.seats.find((s) => s.playerId === view.turnPlayerId)?.displayName ?? '?'}'s turn.`
  const mustCoupReason = me.coins >= 10 ? '10+ coins — you must Coup.' : null
  const targetReason = target.length === 0 ? 'Select a target below.' : null
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <AffordedButton
          label="Income (+1)"
          disabledReason={incomeReason}
          onClick={() => act({ kind: 'Income' })}
          className="rounded bg-gray-200 px-3 py-2 text-sm"
        />
        <AffordedButton
          label="Foreign Aid (+2)"
          disabledReason={fAidReason}
          onClick={() => act({ kind: 'ForeignAid' })}
          className="rounded bg-gray-200 px-3 py-2 text-sm"
        />
        <AffordedButton
          label="Tax / Duke (+3)"
          disabledReason={taxReason}
          onClick={() => act({ kind: 'Tax' })}
          className="rounded bg-gray-200 px-3 py-2 text-sm"
        />
        <AffordedButton
          label="Exchange / Ambassador"
          disabledReason={exchangeReason}
          onClick={() => act({ kind: 'Exchange' })}
          className="rounded bg-gray-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">Target:</label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded border border-gray-300 p-1 text-sm"
        >
          <option value="">(none)</option>
          {aliveOthers.map((s) => (
            <option key={s.playerId} value={s.playerId}>
              {s.displayName}
            </option>
          ))}
        </select>
        <AffordedButton
          label="Coup (-7)"
          disabledReason={coupReason}
          onClick={() => target && act({ kind: 'Coup', targetPlayerId: target })}
          className="rounded bg-red-700 px-3 py-2 text-sm text-white"
        />
        <AffordedButton
          label="Assassinate (-3) / Assassin"
          disabledReason={assassinateReason}
          onClick={() => target && act({ kind: 'Assassinate', targetPlayerId: target })}
          className="rounded bg-red-500 px-3 py-2 text-sm text-white"
        />
        <AffordedButton
          label="Steal / Captain"
          disabledReason={stealReason}
          onClick={() => target && act({ kind: 'Steal', targetPlayerId: target })}
          className="rounded bg-yellow-500 px-3 py-2 text-sm text-white"
        />
      </div>
    </div>
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
      reason = 'You declared this action — cannot challenge yourself.'
    }
  } else {
    // BLOCK_CHALLENGE_WINDOW
    if (view.pendingBlock?.blockerPlayerId === view.myPlayerId) {
      reason = 'You declared this block — cannot challenge yourself.'
    }
  }
  return (
    <AffordedButton
      label="Challenge"
      disabledReason={reason}
      onClick={() => send({ type: 'challenge' })}
      className="rounded bg-red-600 px-3 py-2 text-sm text-white"
    />
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
    <div className="flex flex-wrap gap-2">
      {candidates.map((c) => (
        <button
          key={c}
          onClick={() => send({ type: 'block', claimedCharacter: c })}
          className="rounded bg-purple-600 px-3 py-2 text-sm text-white"
        >
          Block with {c}
        </button>
      ))}
    </div>
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
    <p className="text-sm text-gray-500">{pickerName} is choosing a card to reveal…</p>
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
    <div className="space-y-2">
      <p className="text-sm">Choose a card to reveal:</p>
      <div className="flex gap-2">
        {me.influence.map((inf, i) =>
          inf.status === 'face-down' ? (
            <button
              key={i}
              onClick={() => send({ type: 'influence-pick', cardIndex: i })}
              className="rounded bg-red-600 px-3 py-2 text-sm text-white"
            >
              Reveal {inf.kind}
            </button>
          ) : null,
        )}
      </div>
    </div>
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
    <div className="space-y-2">
      <p className="text-sm">
        Choose 2 cards to keep (the other 2 return to the Court Deck):
      </p>
      <div className="flex flex-wrap gap-2">
        {cards.map((c, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`rounded px-3 py-2 text-sm ${
              selected.includes(i)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={selected.length !== 2}
        className="rounded bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        Keep selected ({selected.length}/2)
      </button>
    </div>
  )
}

function OverPanel({ winnerPlayerId, view }: { winnerPlayerId: string; view: PlayerView }) {
  const winner = view.seats.find((s) => s.playerId === winnerPlayerId)
  return (
    <section>
      <h2 className="mb-4 text-2xl">
        {winner?.isMe ? 'You won!' : `${winner?.displayName ?? '?'} won`}
      </h2>
      <Link href="/" className="text-blue-600 underline">
        Play again
      </Link>
    </section>
  )
}
