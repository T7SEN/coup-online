// Cross-platform deploy script. Replaces the inline `wrangler deploy --var
// SENTRY_RELEASE:$(git rev-parse HEAD)` because POSIX `$(...)` subshell
// syntax doesn't expand under cmd.exe (the default shell pnpm spawns on
// Windows). With the bare `$(git rev-parse HEAD)` text passed literally,
// Sentry was tagging every event with release="$(git rev-parse HEAD)"
// truncated to "$(git" — useless for release attribution.
//
// This Node script computes the SHA via child_process and passes the
// expanded value to wrangler, working identically on Windows / macOS /
// Linux / inside any CI runner.

import { execSync, spawnSync } from 'node:child_process'

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch (err) {
    // CI environments without git, shallow clones without history, etc.
    // Fall back to a useful sentinel rather than crashing the deploy —
    // Sentry will tag events with "unknown-sha" which is at least
    // identifiable as "the git lookup failed" rather than literal "$(git".
    console.warn('git rev-parse HEAD failed:', err instanceof Error ? err.message : err)
    return 'unknown-sha'
  }
}

const sha = gitSha()
console.log(`[deploy] SENTRY_RELEASE=${sha}`)

// Forward all additional arguments to wrangler (e.g. `pnpm run deploy --dry-run`
// becomes `wrangler deploy --var SENTRY_RELEASE:<sha> --dry-run`).
const extraArgs = process.argv.slice(2)

// Use spawnSync with stdio:inherit so wrangler's progress / output streams
// directly to the user's terminal in real time. On non-zero exit, propagate
// the exit code so CI reports the failure correctly.
const result = spawnSync(
  'wrangler',
  ['deploy', '--var', `SENTRY_RELEASE:${sha}`, ...extraArgs],
  { stdio: 'inherit', shell: true },
)

if (result.error) {
  console.error('[deploy] failed to spawn wrangler:', result.error)
  process.exit(1)
}

process.exit(result.status ?? 0)
