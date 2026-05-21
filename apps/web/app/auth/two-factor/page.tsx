import { TwoFactorChallenge } from './two-factor-challenge'

// 2FA challenge page reached during sign-in when the user has 2FA enrolled.
// `force-dynamic` because the page reads `?next=` from the URL — there's
// nothing useful to prerender. Server shell reads searchParams and hands
// the destination to the client form below.

export const dynamic = 'force-dynamic'

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const sp = await searchParams
  return <TwoFactorChallenge next={sp.next ?? '/'} />
}
