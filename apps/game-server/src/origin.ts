// SKILL.md § 5 — Origin allowlist on every WS upgrade.
// Reject unrecognized origins with HTTP 403. Blocks cross-origin WebSocket
// hijacking, which Workers + Origin-unvalidated WS servers are vulnerable to.
//
// Two layers:
//   - Production: strict allowlist of exact origins, controlled by the
//     ALLOWED_ORIGINS env var (comma-separated). Set once a real domain is
//     assigned. Example: "https://coup.example.com,https://www.coup.example.com".
//   - Dev (no env var set): permissive match against localhost + RFC 1918
//     private-network IPs on any port, so testing across LAN tabs (the
//     `Network:` URL Next.js prints — typically http://10.x.x.x:3000)
//     just works.

const DEV_ORIGIN_PATTERNS: ReadonlyArray<RegExp> = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  // RFC 1918 private network ranges
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/,
]

export function isOriginAllowed(
  origin: string | null,
  envList?: string | null,
): boolean {
  if (!origin) return false
  if (envList && envList.trim().length > 0) {
    // Production: strict exact match from env var.
    const list = envList.split(',').map((s) => s.trim()).filter(Boolean)
    return list.includes(origin)
  }
  // Dev: permissive match.
  return DEV_ORIGIN_PATTERNS.some((p) => p.test(origin))
}
