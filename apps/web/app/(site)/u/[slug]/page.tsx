import { notFound, redirect } from 'next/navigation'
import { fetchWorker } from '@/lib/worker-fetch'

// /u/[slug] — vanity URL resolver. Patrons claim a slug in /settings (the
// Patronage section); this route looks it up against /api/patrons/by-slug/
// and redirects to the canonical /profile/[userId] page. Unclaimed or
// released slugs return notFound() (404).
//
// Server Component, dynamic — the lookup must hit the Worker on every request
// because slugs can be transferred (claim → release → re-claim).
//
// Network / 5xx → fetchWorker redirects to /maintenance, same as every other
// Server-side Worker call.

export const dynamic = 'force-dynamic'

interface ResolvedSlug {
  userId: string
  displayName: string
  slug: string
}

export default async function VanitySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Slugs are stored lowercased; the URL form may be mixed-case (browsers
  // don't normalise the path). Lower it here so a typed-in "Alice" still
  // resolves to "alice".
  const normalised = slug.trim().toLowerCase()
  if (normalised.length === 0) notFound()

  const res = await fetchWorker(
    `/api/patrons/by-slug/${encodeURIComponent(normalised)}`,
    { cache: 'no-store' },
  )
  if (res.status === 404) notFound()
  if (!res.ok) notFound()
  const json = (await res.json()) as ResolvedSlug
  redirect(`/profile/${json.userId}`)
}
