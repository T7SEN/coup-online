// Public URLs for the game-server. NEXT_PUBLIC_ prefix means these are inlined
// at build time and visible in browser bundles (safe — these are public).
//
// For production, set NEXT_PUBLIC_GAME_SERVER_HTTP in Vercel env to the
// workers.dev URL (or your custom domain). The WS URL is derived by swapping
// the scheme; override explicitly via NEXT_PUBLIC_GAME_SERVER_WS if needed
// (e.g., wss:// behind a TLS-terminating proxy that differs from https://).

export const GAME_SERVER_HTTP =
  process.env.NEXT_PUBLIC_GAME_SERVER_HTTP ?? 'http://127.0.0.1:8787'

export const GAME_SERVER_WS =
  process.env.NEXT_PUBLIC_GAME_SERVER_WS ??
  GAME_SERVER_HTTP.replace(/^http(s?):/, 'ws$1:')
