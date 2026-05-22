import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site-metadata'

// /sitemap.xml — Next.js convention (app/sitemap.ts → served at
// /sitemap.xml). Lists every public, indexable, content-bearing route.
//
// What's NOT here (intentional):
//   - /auth/*, /admin, /settings, /profile/*, /match/*, /room/*,
//     /maintenance — user-specific, transient, or gated. robots.txt
//     disallows the directories too.
//   - /u/[slug] vanity URLs — would need a dynamic Worker fetch to
//     enumerate. Worth adding when the patron count grows past trivial.
//   - /api/* — never content.
//
// `changeFrequency` and `priority` are hints, not directives. Modern
// Googlebot ignores them but other crawlers (Bing, Yandex, DuckDuckGo
// backends) still use them.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const url = (path: string) => `${SITE.url}${path}`

  return [
    {
      url: url('/'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: url('/about'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.8,
    },
    {
      url: url('/rules'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.8,
    },
    {
      url: url('/leaderboard'),
      lastModified: now,
      changeFrequency: 'daily', // shifts as matches complete
      priority: 0.7,
    },
    {
      url: url('/patrons'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: url('/support'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: url('/changelog'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.4,
    },
    {
      url: url('/privacy'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: url('/terms'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
