import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/site-metadata'

// Default Open Graph card at /opengraph-image (1200×630 PNG).
//
// Generated dynamically by Next.js — no shipped image asset. Renders the
// "COUP / Online" wordmark over a parchment background, with a gold rule
// and the site tagline. Match the in-app brand without needing image files.
//
// Used by every social platform that respects OG (Facebook, LinkedIn, Slack,
// Discord, iMessage previews, etc.) and — because the twitter card config
// in layout.tsx is `summary_large_image` — by Twitter too unless a route
// overrides it (twitter-image.tsx re-exports this).
//
// Fonts: Georgia serif fallback. Cinzel + EB Garamond would need to be
// loaded as ArrayBuffer through ImageResponse's `fonts` option — extra
// latency, and the resulting cards aren't visibly different at this size.

export const alt = `${SITE.name} — ${SITE.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${SITE.parchment} 0%, #F2E8CC 100%)`,
          fontFamily: 'Georgia, serif',
          color: '#3D2F22',
          padding: 64,
          position: 'relative',
        }}
      >
        {/* Inset hairline frame — echoes the in-app card borders. */}
        <div
          style={{
            position: 'absolute',
            inset: 32,
            border: `2px solid ${SITE.gold}`,
            borderRadius: 8,
            opacity: 0.5,
          }}
        />

        {/* Wordmark — "COUP" big oxblood serif, "Online" smaller below. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 168,
              fontWeight: 700,
              color: SITE.themeColor,
              letterSpacing: '0.06em',
              lineHeight: 1,
            }}
          >
            COUP
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 44,
              fontWeight: 400,
              color: '#6D5B49',
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
            }}
          >
            Online
          </div>
        </div>

        {/* Gold rule. */}
        <div
          style={{
            display: 'flex',
            width: 320,
            height: 3,
            background: SITE.gold,
            marginTop: 36,
            marginBottom: 32,
            borderRadius: 2,
          }}
        />

        {/* Tagline. */}
        <div
          style={{
            display: 'flex',
            fontSize: 38,
            fontWeight: 400,
            color: '#3D2F22',
            textAlign: 'center',
            maxWidth: 880,
            lineHeight: 1.3,
          }}
        >
          {SITE.tagline}
        </div>

        {/* Footer slug — the URL, so screenshots have provenance. */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            display: 'flex',
            fontSize: 22,
            color: '#6D5B49',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          coups.app
        </div>
      </div>
    ),
    { ...size },
  )
}
