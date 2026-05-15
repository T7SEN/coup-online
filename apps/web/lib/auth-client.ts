import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'

// Browser-side Better Auth client. Defaults the baseURL to
// `window.location.origin`, which is exactly what we want — the rewrites in
// next.config.ts make /api/auth/* available there. Cookies stay on the
// Vercel origin.
//
// The magic-link plugin is loaded so authClient.signIn.magicLink() resolves
// at the type level.
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
})

export const { signIn, signOut, useSession } = authClient
