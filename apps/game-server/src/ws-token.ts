import { SignJWT } from 'jose'

// SKILL.md § 5 — WS-upgrade JWT. HS256, 5-minute expiry, claims shape
// `{ userId, displayName }`, signed with WS_SIGNING_SECRET. The Worker is
// both the issuer (this file, called from the /api/ws-token route after a
// Better Auth session check) and the verifier (auth.ts::verifyJwt, called
// during the WebSocket upgrade in the GameRoom DO).
//
// Issuer moved from Next.js to the Worker as part of the Better Auth
// migration — now that auth runs on the Worker, the Vercel side just
// proxies (via next.config.ts rewrites). See references/auth.md.

const ALG = 'HS256'
const EXPIRY_SECONDS = 300

export interface WsTokenClaims {
  readonly userId: string
  readonly displayName: string
}

export async function signWsToken(secret: string, claims: WsTokenClaims): Promise<string> {
  if (!secret || secret.length === 0) {
    throw new Error('signWsToken: WS_SIGNING_SECRET is not set')
  }
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ userId: claims.userId, displayName: claims.displayName })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(key)
}
