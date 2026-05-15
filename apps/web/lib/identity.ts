// Dev-mode stable userId per browser. Stored in localStorage so reconnecting
// after a refresh resumes the same seat. SKILL.md § 5 — never use localStorage
// for the session TOKEN; this is just an opaque identifier used to ask the
// Worker for a token.
//
// In production, the userId comes from the Auth.js session and this file
// becomes irrelevant. The Worker doesn't care which issuer signed the JWT —
// only that the secret matches.

const STORAGE_KEY = 'coup-online:userId'

export function getOrCreateUserId(): string {
  // Guard for SSR / pre-mount — the caller should run this from useEffect.
  if (typeof window === 'undefined') return ''
  let id = window.localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = window.crypto.randomUUID()
    window.localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
