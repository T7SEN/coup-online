import { SignJWT } from 'jose'

// SKILL.md § 5 — WS-upgrade JWT. HS256, 5-minute expiry, signed with
// WS_SIGNING_SECRET. The Worker is both the issuer (this file, called from
// the /api/ws-token route after a Better Auth session check) and the
// verifier (auth.ts::verifyJwt, called during the WebSocket upgrade in the
// GameRoom DO).
//
// The token carries identity (userId + displayName) plus the **patron
// cosmetics** that need to appear in the room. Bundling them in the JWT
// means the DO never has to touch D1 itself: the cosmetics are read once
// when the token is issued, frozen for the 5-minute window, and copied onto
// the seat at join time. A patron who toggles their gilded nickname mid-
// match keeps the gilded name for that match (and gets the new state on
// the next token issuance / room).
//
// Token size stays under 1 KB even with cosmetics — well within URL limits.
//
// Issuer moved from Next.js to the Worker as part of the Better Auth
// migration; the Vercel side proxies (next.config.ts rewrites). See
// references/auth.md.

const ALG = 'HS256'
const EXPIRY_SECONDS = 300

export interface WsTokenClaims {
  readonly userId: string
  readonly displayName: string
  // Patron cosmetics — every field nullable / optional so a non-patron token
  // is just `{ userId, displayName }` plus a few false flags. Defaults at
  // the seat side handle missing fields.
  readonly isPatron?: boolean
  readonly founderRank?: number | null
  readonly gildedNickname?: boolean
  readonly cardBackSkin?: string | null
  readonly tableTheme?: string | null
  readonly victoryFlourish?: boolean
}

export async function signWsToken(secret: string, claims: WsTokenClaims): Promise<string> {
  if (!secret || secret.length === 0) {
    throw new Error('signWsToken: WS_SIGNING_SECRET is not set')
  }
  const key = new TextEncoder().encode(secret)
  return new SignJWT({
    userId: claims.userId,
    displayName: claims.displayName,
    // Only include patron fields if the user is actually a patron — keeps
    // non-patron tokens minimal. The DO's verifyJwt produces the WsTokenClaims
    // shape with these as undefined when absent.
    ...(claims.isPatron
      ? {
          isPatron: claims.isPatron,
          founderRank: claims.founderRank ?? null,
          gildedNickname: claims.gildedNickname ?? false,
          cardBackSkin: claims.cardBackSkin ?? null,
          tableTheme: claims.tableTheme ?? null,
          victoryFlourish: claims.victoryFlourish ?? false,
        }
      : {}),
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(key)
}
