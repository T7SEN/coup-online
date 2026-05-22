import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site-metadata'

// Auth-section layout. The only thing it does that the root layout doesn't
// is set noindex on every /auth/* route — sign-in popup, OAuth callback,
// 2FA challenge. None of them are content; all are transient or behind a
// flow. Even though robots.txt disallows /auth/, the meta tag is defense-
// in-depth for crawlers that ignore robots.txt.
//
// Per-route children can override this metadata if they need to (none do
// today). Setting `title: 'Sign in'` here applies via the root template
// fallback for routes that don't supply their own.

export const metadata: Metadata = pageMetadata({
  title: 'Sign in',
  noindex: true,
})

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
