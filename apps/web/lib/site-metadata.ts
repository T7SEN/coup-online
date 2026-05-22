import type { Metadata } from 'next'

// Canonical site identity — referenced from the root layout's metadata, the
// dynamic icon/OG generators, the sitemap, robots.txt, and per-page
// `pageMetadata()` helpers below. Single source so any rebrand only touches
// this file.

export const SITE = {
  name: 'Coup Online',
  shortName: 'Coup',
  url: 'https://coups.app',
  description:
    'Real-time competitive Coup — 3 to 6 players, server-authoritative. Bluff, challenge, and outwit your way to the throne. Free and ad-free.',
  tagline: 'Real-time competitive Coup. 3–6 players.',
  // Renaissance-court oxblood (matches --primary in globals.css). Used for
  // theme-color (browser chrome tint on mobile) + OG image accent.
  themeColor: '#7E1F1F',
  parchment: '#F8F2E2', // background tint for OG image
  gold: '#D5A24D',
  locale: 'en_US',
} as const

// Per-page metadata helper. Plays nicely with the root layout's title
// template (`%s — Coup Online`) — child pages just supply their leaf title
// and the suffix is added automatically. Pass `noindex: true` for private
// or transient routes (settings, admin, match summary, room, profile,
// auth, maintenance) so they don't pollute search results.
//
// `path` controls the canonical URL + the OG `url` tag. Always pass it for
// indexable pages so canonicals are explicit.
export function pageMetadata(opts: {
  title: string
  description?: string
  path?: string
  noindex?: boolean
  /** Override the OG image. Defaults to the root-layout opengraph-image. */
  ogImage?: string
}): Metadata {
  const { title, description, path, noindex, ogImage } = opts

  return {
    title,
    ...(description && { description }),
    ...(path && {
      alternates: { canonical: path },
      openGraph: {
        url: `${SITE.url}${path}`,
        ...(title && { title }),
        ...(description && { description }),
        ...(ogImage && { images: [{ url: ogImage }] }),
      },
      twitter: {
        ...(title && { title }),
        ...(description && { description }),
        ...(ogImage && { images: [ogImage] }),
      },
    }),
    ...(noindex && {
      robots: {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
    }),
  }
}
