import { jwtVerify, SignJWT } from 'jose'

// SKILL.md § 5 — WebSocket auth.
//   Issuance: signed with WS_SIGNING_SECRET (shared between Next.js and Worker), HS256, 5-minute expiry.
//   Verification: DO checks JWT on every upgrade; invalid/expired → 4001 close code.
//
// In production, the Next.js Route Handler at app/api/ws-token/route.ts is the
// canonical issuer (after Auth.js v5 lands). Until then, the Worker exposes
// /api/dev-token (signDevToken below) for testing without Auth.js.

const ALG = 'HS256'
const DEFAULT_EXPIRY_SECONDS = 300 // 5 minutes per SKILL.md § 5

export interface JwtClaims {
  readonly userId: string
  readonly displayName: string
}

export async function signDevToken(
  secret: string,
  claims: JwtClaims,
  expirySeconds = DEFAULT_EXPIRY_SECONDS,
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ userId: claims.userId, displayName: claims.displayName })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${expirySeconds}s`)
    .sign(key)
}

// Returns null on any verification failure. Caller closes WS with 4001 on null
// (SKILL.md § 5).
export async function verifyJwt(secret: string, token: string): Promise<JwtClaims | null> {
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] })
    if (typeof payload.userId !== 'string' || typeof payload.displayName !== 'string') {
      return null
    }
    return { userId: payload.userId, displayName: payload.displayName }
  } catch {
    return null
  }
}
