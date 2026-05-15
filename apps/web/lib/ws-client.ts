import { ClientMessage, ServerMessage } from '@coup-online/protocol'
import { logger } from './logger'

// Typed WebSocket wrapper. SKILL.md § 5 — Zod-validate every WS message at the
// boundary, both directions. This is the boundary on the client side.
//
// `ClientMessage` and `ServerMessage` are imported as both VALUE (Zod schema
// for runtime validation) and TYPE (for static checks), thanks to the
// protocol package's `export const X = ...` + `export type X = z.infer<typeof X>`.

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface WsClientReconnect {
  readonly enabled: boolean
  // Caps the number of attempts before we give up and surface a hard error.
  // Default 8 — with exponential backoff capped at 5 s, that's ~27 s total.
  readonly maxAttempts?: number
  // Initial backoff. Doubles each attempt, clamped to maxDelayMs.
  readonly baseDelayMs?: number
  readonly maxDelayMs?: number
  // Close codes that should NOT trigger a reconnect.
  // Default: [1000 (clean), 4001 (invalid token), 4002 (match full),
  //           4003 (in progress), 4004 (kicked by host)]. SKILL.md § 5 —
  // application close codes.
  readonly nonRetryableCloseCodes?: ReadonlyArray<number>
}

export interface WsClientOptions {
  readonly url: string
  readonly onMessage: (msg: ServerMessage) => void
  readonly onOpen?: () => void
  // Fires after the underlying WebSocket closes. `willReconnect` indicates
  // whether the client is going to attempt another connect (true → caller
  // should show "Reconnecting…", not "Disconnected").
  readonly onClose?: (code: number, reason: string, willReconnect: boolean) => void
  readonly onError?: (err: Event) => void
  // High-level lifecycle state, suitable for UI status banners.
  readonly onStateChange?: (state: ConnectionState) => void
  readonly reconnect?: WsClientReconnect
}

const DEFAULT_NON_RETRYABLE: ReadonlyArray<number> = [1000, 4001, 4002, 4003, 4004]
const DEFAULT_MAX_ATTEMPTS = 8
const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 5_000

export class WsClient {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'connecting'
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  // Set by .close(). Once true, no further onOpen / onMessage / onClose /
  // onError / onStateChange callbacks fire. Mirrors the React 19 StrictMode
  // pattern of suppressing events from a disposed instance.
  private disposed = false

  constructor(private readonly opts: WsClientOptions) {
    this.connect()
  }

  send(msg: ClientMessage): void {
    if (this.disposed) return
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('ws-client: send while socket not open')
      return
    }
    const result = ClientMessage.safeParse(msg)
    if (!result.success) {
      logger.error('ws-client: invalid outbound message', result.error)
      return
    }
    this.ws.send(JSON.stringify(result.data))
  }

  close(code = 1000): void {
    this.disposed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      this.ws.close(code)
    }
    this.ws = null
    this.state = 'closed'
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  get connectionState(): ConnectionState {
    return this.state
  }

  private setState(next: ConnectionState): void {
    if (this.disposed) return
    if (this.state === next) return
    this.state = next
    this.opts.onStateChange?.(next)
  }

  private connect(): void {
    if (this.disposed) return
    const ws = new WebSocket(this.opts.url)
    this.ws = ws
    ws.addEventListener('open', () => {
      if (this.disposed) return
      this.attempts = 0
      this.setState('open')
      this.opts.onOpen?.()
    })
    ws.addEventListener('message', (e) => {
      if (this.disposed) return
      let parsed: unknown
      try {
        parsed = JSON.parse(typeof e.data === 'string' ? e.data : '')
      } catch {
        logger.error('ws-client: failed to parse server message')
        return
      }
      const result = ServerMessage.safeParse(parsed)
      if (!result.success) {
        logger.error('ws-client: invalid server message', result.error)
        return
      }
      this.opts.onMessage(result.data)
    })
    ws.addEventListener('error', (e) => {
      if (this.disposed) return
      this.opts.onError?.(e)
    })
    ws.addEventListener('close', (e) => {
      if (this.disposed) return
      const willReconnect = this.shouldReconnect(e.code)
      this.opts.onClose?.(e.code, e.reason, willReconnect)
      if (willReconnect) {
        this.scheduleReconnect()
      } else {
        this.setState('closed')
      }
    })
  }

  private shouldReconnect(code: number): boolean {
    if (this.disposed) return false
    if (!this.opts.reconnect?.enabled) return false
    const nonRetry =
      this.opts.reconnect.nonRetryableCloseCodes ?? DEFAULT_NON_RETRYABLE
    if (nonRetry.includes(code)) return false
    const maxAttempts =
      this.opts.reconnect.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    return this.attempts < maxAttempts
  }

  private scheduleReconnect(): void {
    if (this.disposed) return
    this.attempts += 1
    this.setState('reconnecting')
    const base = this.opts.reconnect?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
    const cap = this.opts.reconnect?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
    const delay = Math.min(cap, base * 2 ** (this.attempts - 1))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}
