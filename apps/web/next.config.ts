import type { NextConfig } from 'next'

// Better Auth lives on the Worker (SKILL.md § 2 — D1 stays Worker-owned).
// Browsers hit /api/auth/* and /api/ws-token on the Vercel origin so cookies
// scope to that origin; Next.js then proxies the request server-side to the
// Worker. Set-Cookie headers from the Worker flow back through this rewrite
// and apply to the browser's view of the Vercel origin.
//
// SKILL.md § 5 — the public game-server URL must be reachable from Vercel's
// edge / Node runtime. In production that's `https://ws.coup.example.com` or
// the workers.dev URL.
const nextConfig: NextConfig = {
  async rewrites() {
    const target =
      process.env.NEXT_PUBLIC_GAME_SERVER_HTTP ?? 'http://127.0.0.1:8787'
    return [
      { source: '/api/auth/:path*', destination: `${target}/api/auth/:path*` },
      { source: '/api/ws-token', destination: `${target}/api/ws-token` },
    ]
  },
}

export default nextConfig
