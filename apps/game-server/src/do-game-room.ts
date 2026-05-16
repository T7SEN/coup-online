import { DurableObject } from 'cloudflare:workers'
import { ClientMessage, type Phase, type ServerMessage } from '@coup-online/protocol'
import {
  applyAssassinate,
  applyBlock,
  applyBlockChallengeWindowTimeout,
  applyBlockWindowTimeout,
  applyChallenge,
  applyChallengeWindowTimeout,
  applyCoup,
  applyExchange,
  applyExchangePick,
  applyExchangeTimeout,
  applyForeignAid,
  applyIncome,
  applyInfluencePick,
  applyInfluenceTimeout,
  applyStealAction,
  applyTax,
  buildPlayerView,
  dealInitialState,
  forfeitPlayer,
  IllegalActionError,
  type GameState,
} from '@coup-online/game-logic'
import { verifyJwt } from './auth'
import { persistMatchResult } from './db-helpers'
import { logger } from './logger'
import { isOriginAllowed } from './origin'
import { checkAndUpdateRate } from './rate-limit'

// SKILL.md § 3.2 — phases that have a 15s server-side timer.
const TIMED_PHASES: ReadonlySet<Phase> = new Set([
  'CHALLENGE_WINDOW',
  'BLOCK_WINDOW',
  'BLOCK_CHALLENGE_WINDOW',
  'INFLUENCE_LOSS',
  'EXCHANGE_SELECTION',
])

const TIMER_MS = 15_000

// SKILL.md § 3.5 — disconnected players forfeit 30 s after their last WS closes.
const FORFEIT_MS = 30_000

// TEMP(2-player testing): spec is 3 (SKILL.md § 1) — lowered to 2 for local
// testing so the host can start a 2-player match. Revert to 3 before release.
const MIN_PLAYERS_TO_START = 2
const MAX_PLAYERS = 6

// Close codes (RFC 6455 4000-4999 = application-specific).
const CLOSE_INVALID_TOKEN = 4001 // SKILL.md § 5
const CLOSE_MATCH_FULL = 4002
const CLOSE_MATCH_IN_PROGRESS = 4003
const CLOSE_KICKED = 4004

interface LobbyEntry {
  readonly playerId: string
  readonly displayName: string
}

interface PersistedState {
  matchId: string
  // 'LOBBY' until the host presses Start → 'IN_GAME' via dealInitialState.
  lobbyPhase: 'LOBBY' | 'IN_GAME' | 'GAME_OVER'
  lobby: LobbyEntry[]
  // Lobby host — first joiner. Auto-transferred to the next-oldest lobby
  // entry if the host disconnects or is otherwise removed before the game
  // starts. Only the host may send `start-game` or `kick`. Set on LOBBY
  // creation; ignored once lobbyPhase != LOBBY.
  hostPlayerId: string
  game: GameState | null
  // Set when lobbyPhase flips to IN_GAME. Persisted alongside the rest of state
  // so the D1 match row's startedAt survives DO hibernation.
  startedAt?: number
  endedAt?: number
  // SKILL.md § 3.5 — playerId → unix ms deadline after which they forfeit.
  // Populated on webSocketClose; cleared on reconnect and on forfeit.
  disconnects: Record<string, number>
}

// Ensure `state.hostPlayerId` is a current lobby entry. Promotes the oldest
// remaining player to host if the current host is no longer in the lobby
// (because they disconnected or were kicked). No-op when the lobby is empty.
function ensureHost(state: PersistedState): void {
  if (state.lobbyPhase !== 'LOBBY') return
  if (state.lobby.length === 0) return
  if (!state.lobby.some((e) => e.playerId === state.hostPlayerId)) {
    state.hostPlayerId = state.lobby[0].playerId
  }
}

// SKILL.md § 3.5 — phases where exactly one player is the actor / blocker / picker
// and where the phase timer should PAUSE if that single actor is disconnected.
// Other timed phases (CHALLENGE_WINDOW / BLOCK_WINDOW / BLOCK_CHALLENGE_WINDOW)
// are collective: multiple players can act, so the timer keeps ticking even if
// the action's declarer is offline.
function singleActorForPause(game: GameState): string | null {
  if (game.phase === 'INFLUENCE_LOSS') {
    return game.influenceLossQueue[0] ?? null
  }
  if (game.phase === 'EXCHANGE_SELECTION') {
    return game.exchangePool?.actorPlayerId ?? null
  }
  return null
}

export class GameRoom extends DurableObject<Env> {
  // ==========================================================================
  // Upgrade — SKILL.md § 5 (Origin allowlist + JWT verify + Hibernation accept)
  // ==========================================================================
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Upgrade Required', { status: 426 })
    }

    // Defense-in-depth: Worker already checked Origin; recheck here.
    if (!isOriginAllowed(request.headers.get('Origin'), this.env.ALLOWED_ORIGINS ?? null)) {
      return new Response('Forbidden', { status: 403 })
    }

    // JWT in query string per SKILL.md § 5.
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) return new Response('Unauthorized', { status: 401 })
    const claims = await verifyJwt(this.env.WS_SIGNING_SECRET, token)

    const { 0: client, 1: server } = new WebSocketPair()

    if (!claims) {
      // SKILL.md § 5 — invalid/expired token → close code 4001. Accept then close
      // so the client sees the specific code rather than a bare HTTP failure.
      this.ctx.acceptWebSocket(server)
      server.close(CLOSE_INVALID_TOKEN, 'Invalid or expired token')
      return new Response(null, { status: 101, webSocket: client })
    }

    // Tags carry identity across hibernation cycles.
    this.ctx.acceptWebSocket(server, [
      `userId:${claims.userId}`,
      `displayName:${claims.displayName}`,
    ])

    await this.handleJoin(server, claims.userId, claims.displayName)
    return new Response(null, { status: 101, webSocket: client })
  }

  // ==========================================================================
  // Hibernation handlers
  // ==========================================================================

  async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string): Promise<void> {
    const userId = this.getUserIdTag(ws)
    if (!userId) {
      ws.close(CLOSE_INVALID_TOKEN, 'Untagged connection')
      return
    }

    // SKILL.md § 5 — per-connection rate limit.
    const rate = checkAndUpdateRate(ws)
    if (!rate.ok) {
      this.sendTo(ws, { type: 'rate-limit', retryAfterMs: rate.retryAfterMs })
      return
    }

    // SKILL.md § 5 — Zod-validate every inbound message at the boundary.
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {
      this.sendTo(ws, {
        type: 'error',
        code: 'invalid_json',
        message: 'Message is not valid JSON',
      })
      return
    }
    const validation = ClientMessage.safeParse(parsed)
    if (!validation.success) {
      this.sendTo(ws, {
        type: 'error',
        code: 'invalid_message',
        message: validation.error.message,
      })
      return
    }

    try {
      await this.handleMessage(userId, validation.data)
    } catch (err) {
      if (err instanceof IllegalActionError) {
        this.sendTo(ws, { type: 'error', code: err.code, message: err.message })
      } else {
        logger.error('ws message handler failed', err, { matchId: this.matchId })
        this.sendTo(ws, {
          type: 'error',
          code: 'internal_error',
          message: 'Internal server error',
        })
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const userId = this.getUserIdTag(ws)
    if (!userId) return

    // Multi-connection-per-user guard. React 19 StrictMode (dev) double-mounts
    // effects, so a single client can produce TWO WS connections in quick
    // succession — the first is closed by the cleanup function while still
    // connecting. If we treated that as a real disconnect we'd remove the
    // user from the lobby (or mark them disconnected) while their second WS
    // is still alive. Skip the bookkeeping if another WS for the same userId
    // remains.
    const stillConnected = this.ctx
      .getWebSockets()
      .some((w) => w !== ws && this.getUserIdTag(w) === userId)
    if (stillConnected) return

    const state = await this.loadState()
    if (!state) return

    if (state.lobbyPhase === 'LOBBY') {
      state.lobby = state.lobby.filter((e) => e.playerId !== userId)
      ensureHost(state)
      await this.saveState(state)
      await this.broadcastLobby(state)
      return
    }
    if (state.lobbyPhase === 'IN_GAME' && state.game) {
      const seat = state.game.seats.find((s) => s.playerId === userId)
      if (seat) seat.isDisconnected = true
      // SKILL.md § 3.5 — 30 s forfeit deadline. computeAlarm() in afterMutation
      // picks the earliest deadline across all disconnects + the phase timer.
      state.disconnects[userId] = Date.now() + FORFEIT_MS
      await this.afterMutation(state)
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    logger.error('websocket transport error', error, { matchId: this.matchId })
    await this.webSocketClose(ws)
  }

  // ==========================================================================
  // Alarm — handles forfeit deadlines AND phase timeouts (DO has only one
  // alarm slot, so they're multiplexed; scheduleAlarm() picks min deadline).
  // ==========================================================================
  async alarm(): Promise<void> {
    const state = await this.loadState()
    if (!state) return
    if (state.lobbyPhase !== 'IN_GAME' || !state.game) return

    const now = Date.now()
    let mutated = false

    // 1. Process expired forfeits. Apply in deterministic order (insertion
    // order of Object.entries on a string-keyed plain object) for replay
    // consistency. forfeitPlayer may flip phase to GAME_OVER mid-loop; that's
    // fine — subsequent forfeits still apply (revealing cards on already-dead
    // seats is a no-op).
    for (const [pid, deadline] of Object.entries(state.disconnects)) {
      if (deadline > now) continue
      forfeitPlayer(state.game, pid)
      delete state.disconnects[pid]
      mutated = true
    }

    // 2. Process phase timeout — only if the timer wasn't paused (single-actor
    // disconnected). After forfeit processing the phase may have changed; we
    // re-check timerEndsAt against the post-forfeit state.
    const picker = singleActorForPause(state.game)
    const paused = picker != null && state.disconnects[picker] != null
    if (
      !paused &&
      state.game.timerEndsAt != null &&
      state.game.timerEndsAt <= now &&
      TIMED_PHASES.has(state.game.phase)
    ) {
      switch (state.game.phase) {
        case 'CHALLENGE_WINDOW':
          applyChallengeWindowTimeout(state.game)
          break
        case 'BLOCK_WINDOW':
          applyBlockWindowTimeout(state.game)
          break
        case 'BLOCK_CHALLENGE_WINDOW':
          applyBlockChallengeWindowTimeout(state.game)
          break
        case 'INFLUENCE_LOSS': {
          const head = state.game.influenceLossQueue[0]
          if (head) applyInfluenceTimeout(state.game, head)
          break
        }
        case 'EXCHANGE_SELECTION':
          if (state.game.exchangePool) {
            applyExchangeTimeout(state.game, state.game.exchangePool.actorPlayerId)
          }
          break
        default:
          break
      }
      mutated = true
    }

    if (mutated) {
      await this.afterMutation(state)
    } else {
      // Spurious wakeup (alarm fired but nothing due). Reschedule.
      await this.scheduleAlarm(state)
    }
  }

  // ==========================================================================
  // Join / dispatch
  // ==========================================================================

  private async handleJoin(
    ws: WebSocket,
    userId: string,
    displayName: string,
  ): Promise<void> {
    const matchId = this.ctx.id.name ?? this.ctx.id.toString()
    let state = await this.loadState()

    if (!state) {
      state = {
        matchId,
        lobbyPhase: 'LOBBY',
        // First joiner becomes the host. Stable across reconnects of the same
        // userId; transferred to the next-oldest lobby entry on disconnect.
        hostPlayerId: userId,
        lobby: [{ playerId: userId, displayName }],
        game: null,
        disconnects: {},
      }
    } else if (state.lobbyPhase === 'LOBBY') {
      // Add to lobby unless already present (reconnect from same userId).
      // No auto-start — the host must press Start via the start-game
      // ClientMessage once 3-6 players are present.
      if (!state.lobby.some((e) => e.playerId === userId)) {
        if (state.lobby.length >= MAX_PLAYERS) {
          ws.close(CLOSE_MATCH_FULL, 'Match lobby is full')
          return
        }
        state.lobby.push({ playerId: userId, displayName })
      }
      ensureHost(state)
    } else if (state.lobbyPhase === 'IN_GAME' && state.game) {
      // Reconnection only — only existing seats can rejoin.
      const seat = state.game.seats.find((s) => s.playerId === userId)
      if (!seat) {
        ws.close(CLOSE_MATCH_IN_PROGRESS, 'Match already in progress')
        return
      }
      seat.isDisconnected = false
      delete state.disconnects[userId]
    } else if (state.lobbyPhase === 'GAME_OVER') {
      // Read-only post-game view. Seated players can reconnect to see the
      // final state; non-seated connections are rejected.
      const seat = state.game?.seats.find((s) => s.playerId === userId)
      if (!seat) {
        ws.close(CLOSE_MATCH_IN_PROGRESS, 'Match has ended')
        return
      }
    }

    await this.afterMutation(state)
  }

  private async handleMessage(userId: string, msg: ClientMessage): Promise<void> {
    const state = await this.loadState()
    if (!state) {
      throw new IllegalActionError('no_match', 'Match state not initialized')
    }

    // Chat: only in lobby (SKILL.md § 1 — no chat during active game).
    if (msg.type === 'chat') {
      if (state.lobbyPhase !== 'LOBBY') {
        throw new IllegalActionError('chat_not_in_lobby', 'Chat is lobby-only')
      }
      this.broadcastRaw({ type: 'chat', fromPlayerId: userId, text: msg.text })
      return
    }

    // Start-game: only the host may transition LOBBY → IN_GAME, and only when
    // the count is within [MIN_PLAYERS_TO_START, MAX_PLAYERS]. First message
    // wins; subsequent ones see lobbyPhase != LOBBY and bounce.
    if (msg.type === 'start-game') {
      if (state.lobbyPhase !== 'LOBBY') {
        throw new IllegalActionError('not_in_lobby', 'Match is not in LOBBY phase')
      }
      if (state.hostPlayerId !== userId) {
        throw new IllegalActionError(
          'not_host',
          'Only the lobby host may start the match',
        )
      }
      if (state.lobby.length < MIN_PLAYERS_TO_START) {
        throw new IllegalActionError(
          'not_enough_players',
          `Need at least ${MIN_PLAYERS_TO_START} players to start`,
        )
      }
      if (state.lobby.length > MAX_PLAYERS) {
        // Defensive — handleJoin already gates additions at MAX_PLAYERS.
        throw new IllegalActionError(
          'too_many_players',
          `Cannot start with more than ${MAX_PLAYERS} players`,
        )
      }
      const matchId = this.ctx.id.name ?? this.ctx.id.toString()
      state.game = dealInitialState(matchId, state.lobby)
      state.lobbyPhase = 'IN_GAME'
      state.startedAt = Date.now()
      await this.afterMutation(state)
      return
    }

    // Kick: host-only, lobby-only, non-self. Removes the target from the lobby
    // and force-closes all of their WebSocket connections with code 4004 so
    // their client can show a clear "kicked" message.
    if (msg.type === 'kick') {
      if (state.lobbyPhase !== 'LOBBY') {
        throw new IllegalActionError('not_in_lobby', 'Kick is lobby-only')
      }
      if (state.hostPlayerId !== userId) {
        throw new IllegalActionError('not_host', 'Only the host may kick players')
      }
      if (msg.playerId === userId) {
        throw new IllegalActionError('cannot_kick_self', 'Host cannot kick themselves')
      }
      if (!state.lobby.some((e) => e.playerId === msg.playerId)) {
        throw new IllegalActionError(
          'target_not_in_lobby',
          'Target is not in the lobby',
        )
      }
      state.lobby = state.lobby.filter((e) => e.playerId !== msg.playerId)
      // Close every WS belonging to the kicked user. webSocketClose will fire
      // for each, but the multi-connection guard plus the post-removal filter
      // make those handlers no-ops on lobby state.
      for (const ws of this.ctx.getWebSockets()) {
        if (this.getUserIdTag(ws) === msg.playerId) {
          ws.close(CLOSE_KICKED, 'Kicked by host')
        }
      }
      ensureHost(state)
      await this.saveState(state)
      await this.broadcastLobby(state)
      return
    }

    if (state.lobbyPhase !== 'IN_GAME' || !state.game) {
      throw new IllegalActionError('not_in_game', 'Match is not in IN_GAME phase')
    }
    const game = state.game

    switch (msg.type) {
      case 'action': {
        const a = msg.action
        switch (a.kind) {
          case 'Income':
            applyIncome(game, userId)
            break
          case 'ForeignAid':
            applyForeignAid(game, userId)
            break
          case 'Coup':
            applyCoup(game, userId, a.targetPlayerId)
            break
          case 'Tax':
            applyTax(game, userId)
            break
          case 'Assassinate':
            applyAssassinate(game, userId, a.targetPlayerId)
            break
          case 'Steal':
            applyStealAction(game, userId, a.targetPlayerId)
            break
          case 'Exchange':
            applyExchange(game, userId)
            break
        }
        break
      }
      case 'challenge':
        applyChallenge(game, userId)
        break
      case 'block':
        applyBlock(game, userId, msg.claimedCharacter)
        break
      case 'pass-block':
        // No-op in v1. BLOCK_WINDOW resolves via timer or explicit block.
        return
      case 'influence-pick':
        applyInfluencePick(game, userId, msg.cardIndex)
        break
      case 'exchange-pick':
        applyExchangePick(game, userId, msg.keepIndices)
        break
    }

    await this.afterMutation(state)
  }

  // ==========================================================================
  // State + alarm + broadcast bookkeeping
  // ==========================================================================

  private async loadState(): Promise<PersistedState | null> {
    const state = (await this.ctx.storage.get<PersistedState>('state')) ?? null
    // Defensive: older persisted states may predate `disconnects`. Coalesce
    // on read so callers can assume it's always present.
    if (state && !state.disconnects) state.disconnects = {}
    return state
  }

  private async saveState(state: PersistedState): Promise<void> {
    await this.ctx.storage.put('state', state)
  }

  // Single canonical exit path after any state mutation. Decides:
  //   - GAME_OVER: stamp endedAt, broadcast game-end, persist to D1
  //   - LOBBY: broadcast lobby update
  //   - IN_GAME: re-arm phase timer (paused if single-actor offline), schedule
  //     alarm (min of phase + disconnect deadlines), broadcast state-update,
  //     fire exchange-pick prompt if applicable.
  private async afterMutation(state: PersistedState): Promise<void> {
    if (state.lobbyPhase === 'IN_GAME' && state.game?.phase === 'GAME_OVER') {
      await this.finalizeGameEnd(state)
      return
    }

    if (state.lobbyPhase === 'IN_GAME' && state.game) {
      const picker = singleActorForPause(state.game)
      const paused = picker != null && state.disconnects[picker] != null
      if (TIMED_PHASES.has(state.game.phase) && !paused) {
        state.game.timerEndsAt = Date.now() + TIMER_MS
      } else {
        state.game.timerEndsAt = null
      }
    }

    await this.saveState(state)
    await this.scheduleAlarm(state)

    if (state.lobbyPhase === 'LOBBY') {
      await this.broadcastLobby(state)
    } else if (state.lobbyPhase === 'IN_GAME') {
      await this.broadcast(state)
      // Idempotent: send exchange-pick prompt to actor whenever we're in
      // EXCHANGE_SELECTION. Helps with reconnection (actor reconnects → next
      // afterMutation re-sends the prompt).
      if (
        state.game &&
        state.game.phase === 'EXCHANGE_SELECTION' &&
        state.game.exchangePool
      ) {
        this.sendExchangePrompt(state.game.exchangePool)
      }
    }
  }

  private async finalizeGameEnd(state: PersistedState): Promise<void> {
    if (!state.game) return
    state.lobbyPhase = 'GAME_OVER'
    if (!state.endedAt) state.endedAt = Date.now()
    state.game.timerEndsAt = null
    state.disconnects = {}
    await this.ctx.storage.deleteAlarm()
    await this.saveState(state)
    await this.broadcastGameEnd(state)
    // SKILL.md § 5 — MMR write is the LAST step. Best-effort: if D1 is down or
    // schema-mismatched, log and continue; the game-end broadcast already went
    // out so players see the result.
    if (state.startedAt != null) {
      try {
        await persistMatchResult(
          this.env.DB,
          state.game,
          state.game.seats.map((s) => ({
            playerId: s.playerId,
            displayName: s.displayName,
          })),
          state.startedAt,
          state.endedAt,
        )
      } catch (err) {
        logger.error('persistMatchResult failed', err, { matchId: this.matchId })
      }
    }
  }

  private async scheduleAlarm(state: PersistedState): Promise<void> {
    const deadlines: number[] = []
    if (state.lobbyPhase === 'IN_GAME' && state.game?.timerEndsAt != null) {
      deadlines.push(state.game.timerEndsAt)
    }
    for (const d of Object.values(state.disconnects)) {
      deadlines.push(d)
    }
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm()
      return
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines))
  }

  // ==========================================================================
  // Broadcast — SKILL.md § 3.1 (per-recipient PlayerView slicing)
  // ==========================================================================

  private async broadcast(state: PersistedState): Promise<void> {
    if (!state.game) return
    for (const ws of this.ctx.getWebSockets()) {
      const userId = this.getUserIdTag(ws)
      if (!userId) continue
      if (!state.game.seats.some((s) => s.playerId === userId)) continue
      const view = buildPlayerView(state.game, userId)
      this.sendTo(ws, { type: 'state-update', view })
    }
  }

  private async broadcastGameEnd(state: PersistedState): Promise<void> {
    if (!state.game) return
    const winner = state.game.seats.find((s) => s.isAlive)
    if (!winner) {
      logger.error('broadcastGameEnd: no alive seat at GAME_OVER', undefined, {
        matchId: this.matchId,
      })
      return
    }
    for (const ws of this.ctx.getWebSockets()) {
      const userId = this.getUserIdTag(ws)
      if (!userId) continue
      if (!state.game.seats.some((s) => s.playerId === userId)) continue
      const finalView = buildPlayerView(state.game, userId)
      this.sendTo(ws, {
        type: 'game-end',
        winnerPlayerId: winner.playerId,
        finalView,
      })
    }
  }

  private async broadcastLobby(state: PersistedState): Promise<void> {
    const count = state.lobby.length
    const payload: ServerMessage = {
      type: 'lobby-update',
      matchId: state.matchId,
      hostPlayerId: state.hostPlayerId,
      players: state.lobby.map((e) => ({
        playerId: e.playerId,
        displayName: e.displayName,
      })),
      minPlayersToStart: MIN_PLAYERS_TO_START,
      maxPlayers: MAX_PLAYERS,
      canStart: count >= MIN_PLAYERS_TO_START && count <= MAX_PLAYERS,
    }
    for (const ws of this.ctx.getWebSockets()) {
      this.sendTo(ws, payload)
    }
  }

  private broadcastRaw(msg: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets()) {
      this.sendTo(ws, msg)
    }
  }

  private sendExchangePrompt(pool: NonNullable<GameState['exchangePool']>): void {
    if (pool.cards.length !== 4) {
      logger.error('sendExchangePrompt: pool must have 4 cards', undefined, {
        matchId: this.matchId,
        poolSize: pool.cards.length,
      })
      return
    }
    const msg: ServerMessage = {
      type: 'prompt',
      prompt: {
        kind: 'exchange-pick',
        cards: [pool.cards[0], pool.cards[1], pool.cards[2], pool.cards[3]],
      },
    }
    for (const ws of this.ctx.getWebSockets()) {
      if (this.getUserIdTag(ws) === pool.actorPlayerId) {
        this.sendTo(ws, msg)
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private getUserIdTag(ws: WebSocket): string | null {
    const tags = this.ctx.getTags(ws)
    const tag = tags.find((t) => t.startsWith('userId:'))
    return tag ? tag.slice('userId:'.length) : null
  }

  // GameRoom DOs are keyed via idFromName(matchId), so ctx.id.name IS the
  // matchId. Passed as a logger attribute so every event (Sentry Log + Issue)
  // is filterable per game (SKILL.md § 5).
  private get matchId(): string {
    return this.ctx.id.name ?? 'unknown'
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // Send failures are routine — the socket closed between getWebSockets()
      // and send(). Warn-level, no Issue (would spam Sentry).
      logger.warn('ws send failed', { matchId: this.matchId })
    }
  }
}
