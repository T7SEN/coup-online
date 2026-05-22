import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site-metadata'

// /robots.txt — Next.js convention (app/robots.ts → served at /robots.txt).
//
// Public pages get indexed; everything user-specific, transient, or
// non-content (auth flows, the WebSocket-driven game room, the proxied API
// routes, the admin console) is disallowed. The per-route metadata on those
// pages also sets `robots: { index: false, follow: false }` as defense in
// depth — robots.txt is advisory, the meta tag is enforced by well-behaved
// crawlers even when they ignore robots.txt for one reason or another.
//
// `sitemap` lets crawlers discover the static public routes from one URL.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/', // every Worker proxy route — never indexable content
          '/auth/', // sign-in popup, OAuth callback, 2FA challenge — transient
          '/admin', // admin console — gated server-side anyway
          '/admin/',
          '/settings', // user-specific
          '/profile', // user-specific (the /profile/[userId] sub-routes too)
          '/profile/',
          '/match/', // participant-only per SKILL.md § 3.6
          '/room/', // live game state, ephemeral
          '/maintenance', // status page — don't want this returned for normal queries
          '/_next/', // build output
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
