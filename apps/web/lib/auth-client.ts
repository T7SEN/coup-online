import { createAuthClient } from 'better-auth/react'
import {
  magicLinkClient,
  twoFactorClient,
} from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

// Browser-side Better Auth client. Defaults the baseURL to
// `window.location.origin`, which is exactly what we want — the rewrites in
// next.config.ts make /api/auth/* available there. Cookies stay on the
// Vercel origin.
//
// Plugins:
//   - magicLinkClient — exposes `authClient.signIn.magicLink()` types.
//   - twoFactorClient — exposes `authClient.twoFactor.*` (enable / verify /
//     disable / generateBackupCodes). `twoFactorPage` is the route this
//     client redirects to when a sign-in flow needs a 2FA challenge —
//     `/auth/two-factor` collects the TOTP code.
//   - passkeyClient — exposes `authClient.signIn.passkey()`,
//     `authClient.passkey.addPasskey()`, `…deletePasskey()`,
//     `…updatePasskey()`, and the reactive `useListPasskeys()` hook
//     (backed by the `listPasskeys` atom in `@better-auth/passkey/client`).
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient({ twoFactorPage: '/auth/two-factor' }),
    passkeyClient(),
  ],
})

export const { signIn, signOut, useSession } = authClient
