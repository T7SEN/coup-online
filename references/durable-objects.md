# Durable Objects — Patterns & Reference

Companion to SKILL.md § 3.3, § 3.4. Documents the concrete DO patterns used in
`apps/game-server/` and the rules they enforce. All DOs are SQLite-backed per
SKILL.md § 3.3 (free-tier requirement).

---

## The three DOs

| Class | Wrangler binding | Scope | Status |
|---|---|---|---|
| `GameRoom` | `GAME_ROOM` | One DO per match, keyed by matchId via `idFromName` | ✓ implemented |
| `MatchmakingQueue` | `MATCHMAKING_QUEUE` | One global DO for the public matchmaking queue | stub (501) |
| `RoomCodeRegistry` | `ROOM_CODE_REGISTRY` | One global DO mapping 6-char room codes → match DO IDs | stub (501) |

All three are declared as `new_sqlite_classes` in `apps/game-server/wrangler.toml`'s
`[[migrations]]` block — **never** `new_classes` (paid-plan-only).

---

## SQLite-backed vs key-value-backed

| | SQLite-backed (`new_sqlite_classes`) | Key-value (`new_classes`) |
|---|---|---|
| Free-tier eligible | ✓ | ✗ (Workers Paid only) |
| `ctx.storage.sql.exec(...)` SQL API | ✓ | ✗ |
| `ctx.storage.get(key)` / `.put(key, value)` KV API | ✓ (compiled to SQL internally) | ✓ |
| Per-DO storage | 10 GB | 128 KB per key, 50 MB total |

`GameRoom` uses the KV API exclusively (`ctx.storage.get('state')` / `put('state', state)`)
because the game state is one cohesive JSON blob. If a future feature needed
per-match audit rows queryable by SQL, we'd switch to `ctx.storage.sql`. Until
then, KV is simpler and works fine on SQLite-backed DOs.

---

## Hibernation API — SKILL.md § 3.3

**Critical for the free tier.** Without Hibernation, every connected match
accrues continuous duration charges and the free tier evaporates. With
Hibernation, the DO sleeps between messages — compute drops to zero — while
WebSocket connections persist via the runtime.

### Required handlers

```ts
import { DurableObject } from 'cloudflare:workers'

export class GameRoom extends DurableObject<Env> {
  // 1. HTTP fetch — handles the WS upgrade request
  async fetch(request: Request): Promise<Response> { /* ... */ }

  // 2. Hibernation callbacks — fire after wake on incoming message / close / error
  async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string): Promise<void> { /* ... */ }
  async webSocketClose(ws: WebSocket): Promise<void> { /* ... */ }
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> { /* ... */ }

  // 3. Alarm — for timed phases (CHALLENGE_WINDOW, BLOCK_WINDOW, etc.)
  async alarm(): Promise<void> { /* ... */ }
}
```

### Accept via `ctx.acceptWebSocket` (NOT `ws.accept()`)

```ts
const { 0: client, 1: server } = new WebSocketPair()
this.ctx.acceptWebSocket(server, [
  `userId:${claims.userId}`,         // tags — see below
  `displayName:${claims.displayName}`,
])
return new Response(null, { status: 101, webSocket: client })
```

`ws.accept()` defeats hibernation. Always use `ctx.acceptWebSocket()`.

### Identity tags survive hibernation

In-memory state is **lost on hibernation** (no `private state: GameState` field
that persists). But **tags attached at accept time persist**. Use them to bind
identity to the connection:

```ts
this.ctx.acceptWebSocket(server, [`userId:${id}`, `displayName:${name}`])

// Later, after wake:
private getUserIdTag(ws: WebSocket): string | null {
  const tags = this.ctx.getTags(ws)
  const tag = tags.find((t) => t.startsWith('userId:'))
  return tag ? tag.slice('userId:'.length) : null
}
```

### State is always loaded from storage

```ts
private async loadState(): Promise<PersistedState | null> {
  return (await this.ctx.storage.get<PersistedState>('state')) ?? null
}
```

Don't cache `this.state` as a field — it'll be `undefined` after hibernation wake.

---

## Alarms — SKILL.md § 3.2 + § 3.5 (multiplexed phase + forfeit deadlines)

Each DO has **exactly one alarm slot**. The GameRoom DO multiplexes two
sources of deadlines through it:

1. **Phase timer** — 15s for each timed phase (CHALLENGE_WINDOW / BLOCK_WINDOW
   / BLOCK_CHALLENGE_WINDOW / INFLUENCE_LOSS / EXCHANGE_SELECTION).
2. **Forfeit timer** — 30s per disconnected player (SKILL.md § 3.5).

`scheduleAlarm()` picks the **minimum** deadline across both sources. The
`alarm()` handler then processes whatever has come due.

### Setting an alarm

```ts
private async scheduleAlarm(state: PersistedState): Promise<void> {
  const deadlines: number[] = []
  if (state.lobbyPhase === 'IN_GAME' && state.game?.timerEndsAt != null) {
    deadlines.push(state.game.timerEndsAt)
  }
  for (const d of Object.values(state.disconnects)) deadlines.push(d)
  if (deadlines.length === 0) {
    await this.ctx.storage.deleteAlarm()
    return
  }
  await this.ctx.storage.setAlarm(Math.min(...deadlines))
}
```

### Handling the alarm fire

The `alarm()` method processes expired forfeits first (they may flip the
phase to GAME_OVER), then the phase timer if it expired AND wasn't paused:

```ts
async alarm(): Promise<void> {
  const state = await this.loadState()
  if (!state || state.lobbyPhase !== 'IN_GAME' || !state.game) return
  const now = Date.now()
  let mutated = false

  // 1. Forfeits first.
  for (const [pid, deadline] of Object.entries(state.disconnects)) {
    if (deadline > now) continue
    forfeitPlayer(state.game, pid)
    delete state.disconnects[pid]
    mutated = true
  }

  // 2. Phase timer (only if not paused by single-actor disconnect).
  const picker = singleActorForPause(state.game)
  const paused = picker != null && state.disconnects[picker] != null
  if (
    !paused &&
    state.game.timerEndsAt != null &&
    state.game.timerEndsAt <= now &&
    TIMED_PHASES.has(state.game.phase)
  ) {
    /* switch on state.game.phase — applyChallengeWindowTimeout / ... */
    mutated = true
  }
  if (mutated) await this.afterMutation(state)
  else await this.scheduleAlarm(state)
}
```

### Pause rule — single-actor phases

SKILL.md § 3.5 — "action timer pauses on actor disconnect" applies ONLY to
phases where exactly one player can act:

| Phase | Actor whose disconnect pauses the timer |
|---|---|
| `INFLUENCE_LOSS` | `influenceLossQueue[0]` |
| `EXCHANGE_SELECTION` | `exchangePool.actorPlayerId` |

Other timed phases (CHALLENGE_WINDOW / BLOCK_WINDOW / BLOCK_CHALLENGE_WINDOW)
are collective — any player can respond — so the timer keeps ticking even if
the action declarer goes offline.

When a paused-phase actor reconnects, `afterMutation` re-arms the phase timer
fresh (full TIMER_MS), not from where it paused. Documented choice: simpler
than resume-with-elapsed and harmless given the 30s forfeit prevents abuse.

### Rescheduling on mutation

```ts
private async afterMutation(state: PersistedState) {
  if (state.lobbyPhase === 'IN_GAME' && state.game?.phase === 'GAME_OVER') {
    // GAME_OVER branch: broadcast game-end + persist to D1, no alarm.
    return this.finalizeGameEnd(state)
  }
  if (state.lobbyPhase === 'IN_GAME' && state.game) {
    const picker = singleActorForPause(state.game)
    const paused = picker != null && state.disconnects[picker] != null
    if (TIMED_PHASES.has(state.game.phase) && !paused) {
      state.game.timerEndsAt = Date.now() + 15_000
    } else {
      state.game.timerEndsAt = null
    }
  }
  await this.saveState(state)
  await this.scheduleAlarm(state)
  /* ... broadcast + optional exchange prompt ... */
}
```

`timerEndsAt` is mirrored into the `GameState` so the PlayerView reflects the
deadline for client-side countdown rendering. When paused, `timerEndsAt` is
null and the client renders no countdown.

---

## Routing to a DO

```ts
// In the Worker entry route (apps/game-server/src/index.ts)
const id = c.env.GAME_ROOM.idFromName(matchId)  // stable mapping
const stub = c.env.GAME_ROOM.get(id)
return stub.fetch(c.req.raw)                    // forwards the WS upgrade
```

`idFromName` is the right choice for "user-chosen identifier → DO":
- Same matchId always routes to the same DO instance
- Multiple players opening the same matchId converge on one DO

`newUniqueId()` is the alternative for "server-generated unique DO" (e.g.,
the global `MatchmakingQueue` DO uses one well-known name like `"queue"`).

---

## Authentication on WS upgrade

SKILL.md § 5 — full flow:

| Step | Where | Behavior |
|---|---|---|
| 1. JWT issuance | Next.js `app/api/ws-token/route.ts` (production) or Worker `POST /api/dev-token` (dev mode until Auth.js lands) | HS256-signed claims `{ userId, displayName, exp }`, 5-minute expiry |
| 2. Origin allowlist | Worker entry route `GET /api/ws` | `403` for unrecognized Origins. Hard-coded allowlist in `apps/game-server/src/origin.ts` |
| 3. WS upgrade routed to DO | Worker entry → `env.GAME_ROOM.get(idFromName(matchId)).fetch(request)` | passes the upgrade request as-is |
| 4. JWT verification | `GameRoom.fetch()` (defense-in-depth) | `verifyJwt(env.WS_SIGNING_SECRET, token)`; on failure → accept then close with code `4001` |
| 5. Identity bound to WS | `ctx.acceptWebSocket(ws, tags)` | tags `userId:…` / `displayName:…` survive hibernation |
| 6. Per-message rate limit | `webSocketMessage` handler | 30 messages per 5-second window; excess returns `{ type: 'rate-limit', retryAfterMs }` to that connection only |

`WS_SIGNING_SECRET` is shared between Next.js and the Worker. Set in both
environments:
- Worker: `pnpm --filter @coup-online/game-server exec wrangler secret put WS_SIGNING_SECRET`
- Next.js: Vercel env var `WS_SIGNING_SECRET`
- Local dev (Worker side): `apps/game-server/.dev.vars` with `WS_SIGNING_SECRET = "..."`
- Local dev (Next.js side): `apps/web/.env.local` with `WS_SIGNING_SECRET=...`

---

## State shape inside GameRoom

```ts
interface PersistedState {
  matchId: string
  lobbyPhase: 'LOBBY' | 'IN_GAME' | 'GAME_OVER'
  hostPlayerId: string                                // lobby host; auto-transferred
  lobby: { playerId: string; displayName: string }[]  // populated in LOBBY
  game: GameState | null                              // populated in IN_GAME
  startedAt?: number                                  // stamped at LOBBY → IN_GAME
  endedAt?: number                                    // stamped at GAME_OVER
  disconnects: Record<string, number>                 // playerId → forfeit deadline (ms)
}
```

### Lobby host model

- `hostPlayerId` is set to the first joiner when the DO's state is created.
- An internal `ensureHost(state)` helper runs after every lobby mutation
  (join / disconnect / kick) and promotes `state.lobby[0]` to host if the
  current host is no longer in the lobby.
- Only the host may send `start-game` or `kick` ClientMessages. Both error
  with code `not_host` from other senders.
- `kick` removes the target from the lobby and force-closes their WebSocket
  with code `4004` (`CLOSE_KICKED`). Clients map this code to "You were
  kicked by the host" and treat it as non-retryable.

`lobbyPhase` is the outer state machine of the match (pre-game / in-game /
ended). `game.phase` from `@coup-online/game-logic` is the inner state machine
(AWAITING_ACTION, CHALLENGE_WINDOW, etc.).

Transition: `LOBBY` requires an explicit `start-game` ClientMessage from the
**host** when the count is within `[MIN_PLAYERS_TO_START=3, MAX_PLAYERS=6]`.
First message wins; subsequent ones bounce with `not_in_lobby`. Late joiners
(after game-start) get `4002` close code (lobby full at 6) or `4003` (match
in progress). Kicked players get `4004`.

`lobby-update` broadcasts include `hostPlayerId`, `canStart: boolean`,
`minPlayersToStart`, and `maxPlayers` so the client can render the host
badge, host-gated Start / Kick buttons, and seat-availability text directly.

---

## Lobby lifecycle

```
   first WS connection           3rd WS connection           game ends
LOBBY ─────────────────────► IN_GAME ─────────────────────► GAME_OVER
   ▲                              │ (state.game === null)        │
   │                              │                              │
   │  4002 close                  │  4003 close on join          │
   └──────  late joiners ─────────┘                              │
                                  │                              │
                                  └ alarms cycle on TIMED_PHASES ┘
```

---

## Message dispatch

Inbound `ClientMessage` types map to game-logic handlers:

| ClientMessage `type` | Game-logic call |
|---|---|
| `action` with `kind: 'Income'` | `applyIncome` |
| `action` with `kind: 'ForeignAid'` | `applyForeignAid` |
| `action` with `kind: 'Coup'` | `applyCoup` |
| `action` with `kind: 'Tax'` | `applyTax` |
| `action` with `kind: 'Assassinate'` | `applyAssassinate` |
| `action` with `kind: 'Steal'` | `applyStealAction` |
| `action` with `kind: 'Exchange'` | `applyExchange` |
| `challenge` | `applyChallenge` (handles both action & block challenges by phase) |
| `block` | `applyBlock` |
| `pass-block` | no-op in v1 (timer drives BLOCK_WINDOW resolution) |
| `influence-pick` | `applyInfluencePick` |
| `exchange-pick` | `applyExchangePick` |
| `start-game` | `dealInitialState` + `lobbyPhase = 'IN_GAME'` + `startedAt` stamp (LOBBY-only, host-only) |
| `kick` | Remove target from lobby + close their WS with 4004 (LOBBY-only, host-only) |
| `chat` | `broadcastRaw` chat (lobby-only — rejected if phase ≠ LOBBY per SKILL.md § 1) |

`IllegalActionError` thrown from game-logic is caught and sent back to the
offending connection only, with its stable `code` field intact.

---

## Broadcast — per-recipient PlayerView slicing

SKILL.md § 3.1 — every state mutation routes through this:

```ts
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
```

`buildPlayerView` is the canonical slicer (SKILL.md § 3.1, § 5) — strips other
players' face-down cards to `{ status: 'hidden' }` and collapses the court
deck to `{ count }`.

For pre-game, a parallel `broadcastLobby` sends `lobby-update` payloads — a
separate ServerMessage variant added to `packages/protocol` for this purpose.

At GAME_OVER, `broadcastGameEnd` replaces the usual `state-update` with a
`game-end` message carrying `winnerPlayerId` plus a per-recipient `finalView`.

### Private `prompt` for exchange-pick — SKILL.md § 3.2 phase 7

When the game enters `EXCHANGE_SELECTION`, the Ambassador's 4-card pool (2
own + 2 drawn) is private to that player. The DO sends a `prompt` message
addressed only to the actor's WebSocket:

```ts
private sendExchangePrompt(pool: NonNullable<GameState['exchangePool']>): void {
  const msg: ServerMessage = {
    type: 'prompt',
    prompt: { kind: 'exchange-pick', cards: [pool.cards[0], pool.cards[1], pool.cards[2], pool.cards[3]] },
  }
  for (const ws of this.ctx.getWebSockets()) {
    if (this.getUserIdTag(ws) === pool.actorPlayerId) this.sendTo(ws, msg)
  }
}
```

Called at the tail of every `afterMutation` while `phase === 'EXCHANGE_SELECTION'`
— so reconnecting actors re-receive the prompt and re-render the picker.

### Persisting match results to D1 — SKILL.md § 3.6 / § 5

At GAME_OVER, `finalizeGameEnd` calls `persistMatchResult` from
`src/db-helpers.ts`. The helper:
1. Ensures each player has a `user` row (dev seeding; Auth.js v5 owns this in
   prod — synthetic `<playerId>@dev.local` email used as a bridge).
2. Snapshots pre-match mu/sigma from those rows.
3. Builds `SeatResult[]`. Winner finishes at position 1; everyone else is
   tied at 2 (TrueSkill handles tied ranks).
4. Calls `rateMatch` → `RatingDelta[]`.
5. `insertMatchResult(db, { match, players, history })` writes atomically via
   D1 `db.batch()`.

**Best-effort:** wrapped in try/catch so a D1 failure doesn't crash the
game-end broadcast. SKILL.md § 5 — MMR write is the LAST step; if it fails,
log and continue.

---

## Disconnect handling — SKILL.md § 3.5

Two-step protocol: mark the seat disconnected and stamp a 30s forfeit
deadline; `afterMutation` then re-runs the alarm-scheduling logic.

```ts
async webSocketClose(ws: WebSocket): Promise<void> {
  const userId = this.getUserIdTag(ws)
  if (!userId) return
  // React 19 StrictMode dev-double-mount guard: if another live WS exists for
  // the same userId, this close is a transient cleanup, not a real disconnect.
  const stillConnected = this.ctx
    .getWebSockets()
    .some((w) => w !== ws && this.getUserIdTag(w) === userId)
  if (stillConnected) return
  const state = await this.loadState()
  if (!state) return
  if (state.lobbyPhase === 'LOBBY') {
    state.lobby = state.lobby.filter((e) => e.playerId !== userId)
    await this.saveState(state)
    await this.broadcastLobby(state)
    return
  }
  if (state.lobbyPhase === 'IN_GAME' && state.game) {
    const seat = state.game.seats.find((s) => s.playerId === userId)
    if (seat) seat.isDisconnected = true
    state.disconnects[userId] = Date.now() + 30_000
    await this.afterMutation(state)  // re-schedules alarm and broadcasts
  }
}
```

### Reconnect

`handleJoin` clears the entry from `state.disconnects` when a seated player
reconnects, then runs `afterMutation` which re-arms the phase timer (fresh
TIMER_MS) if the resumed phase was paused.

### Forfeit on alarm fire

`forfeitPlayer(state.game, playerId)` (from `@coup-online/game-logic`)
performs the actual game-state mutation:
- Flip every face-down card to revealed, mark seat dead.
- Drop the player from `influenceLossQueue`.
- If they were the Ambassador actor, return the 4-card pool to the deck and
  null `exchangePool`.
- If they were the actor of a pending action or block, evaporate the
  interaction. Conservative v1 choice — disconnect mid-block cancels the
  parent action too. Standard Coup doesn't legislate this; a future rule
  could resolve the action as "no block declared" instead.
- Phase transitions to next picker (INFLUENCE_LOSS), to the actor
  (EXCHANGE_SELECTION when forfeitee wasn't the actor), or to next-turn /
  GAME_OVER via `concludeTurn`.

Idempotent on already-eliminated seats. Tested in
`packages/game-logic/test/forfeit.test.ts`.

---

## Local dev

```bash
# Apply schema to local D1 (one-time)
pnpm --filter @coup-online/game-server exec wrangler d1 migrations apply coup-online-db --local

# Set the dev secret (one-time; .dev.vars is gitignored)
echo 'WS_SIGNING_SECRET = "your-dev-secret-here"' > apps/game-server/.dev.vars

# Boot worker (port 8787)
pnpm --filter @coup-online/game-server dev

# Boot frontend (port 3000)
pnpm --filter @coup-online/web dev

# Test: open 3 browser tabs at http://localhost:3000
# 1. Enter different display names in each tab
# 2. Tab 1: Create new match → copy the match code
# 3. Tabs 2 & 3: Join via the match code
# 4. Game auto-starts when the 3rd tab joins
```

---

## MatchmakingQueue + RoomCodeRegistry (planned)

Both are still 501 stubs. SKILL.md § 3.3 / § 3.4:

**`RoomCodeRegistry`** — single global DO mapping 6-char base32 codes
(alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, no ambiguous chars) to GameRoom
DO IDs. Codes expire 30 minutes after creation if no game starts. Generated
via `crypto.getRandomValues()` per SKILL.md § 5 (`randomIntBelow` helper from
`packages/game-logic` can be reused).

**v1 shortcut:** `apps/web/lib/match-code.ts::generateMatchCode()` produces
the 6-char code in the same alphabet on the client and uses it directly as
`idFromName(code)` for the GameRoom DO. Skipping the registry trades
collision resistance and TTL for simplicity. Birthday-paradox collision
probability under realistic concurrent-match counts is negligible (32^6 ≈
1.07 B). The matching `parseMatchCode()` normalizes any URL paste (e.g.,
`https://host/room/ABCDEF`) into the bare code and upper-cases it so
`idFromName`'s case-sensitivity doesn't fork the lobby.

**`MatchmakingQueue`** — single global DO. Players opt into public
matchmaking with their conservative rating (mu − 3·sigma). DO Alarm runs every
2s; pairs 3-6 players within an MMR band; spawns a GameRoom DO; notifies
participants over their existing WS to switch rooms.

---

## See also

- **Canonical spec:** [`SKILL.md`](../SKILL.md) § 3.3 (Durable Object Per Room), § 3.4 (Matchmaking), § 3.5 (Reconnection), § 5 (Hibernation + WS auth + Origin + rate limit)
- **State machine inside the DO:** [`state-machine.md`](./state-machine.md)
- **Why SQLite-backed only:** [`anti-hallucination.md`](./anti-hallucination.md) — Durable Objects section
- **Per-recipient slicing:** [`coding-patterns.md`](./coding-patterns.md) § 1
- **WS auth code (jose, HS256, 5-minute expiry):** [`coding-patterns.md`](./coding-patterns.md) § 17
- **Rate limit pattern:** [`coding-patterns.md`](./coding-patterns.md) § 19
- **D1 schema written from `endGame()`:** [`db-schema.md`](./db-schema.md) (`insertMatchResult`)
- **Rating math at game end:** [`rating.md`](./rating.md)
- **Source:** `apps/game-server/src/do-game-room.ts` (full impl), `do-matchmaking.ts` / `do-room-codes.ts` (stubs)
