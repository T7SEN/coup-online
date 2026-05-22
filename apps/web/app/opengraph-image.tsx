import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/site-metadata'

// Default Open Graph card at /opengraph-image (1200×630 PNG). Generated
// dynamically by Next.js — no shipped image asset. Used by every social
// platform that respects OG (Facebook, LinkedIn, Slack, Discord, iMessage
// previews), and — because twitter card config in layout.tsx is
// `summary_large_image` — by Twitter too (twitter-image.tsx re-exports
// this so there's a single source of truth).
//
// Design: aged-parchment background with vignette + double gold frame +
// corner accents → massive COUP wordmark in Cinzel with gold glow + drop
// shadow → tracked "ONLINE" subtitle → ornament rule with diamond →
// EB Garamond italic tagline → small monogram-style coups.app badge.
//
// Fonts are fetched from Google Fonts at render time (cached forever
// because Google's font URLs are version-stamped). The fetch happens
// inside the route handler so it doesn't bloat the deploy bundle.

export const alt = `${SITE.name} — ${SITE.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Pull a single TTF weight/style from Google Fonts via the css2 endpoint.
// IMPORTANT: Satori (the engine behind next/og's ImageResponse) needs
// TTF/OTF, NOT woff2 — it errors with "Unsupported OpenType signature wOF2"
// otherwise. Google Fonts serves the response format based on the
// User-Agent: modern Chrome → woff2 (rejected), legacy Chrome → ttf
// (accepted). Sending an old Chrome 36 (2014) UA reliably triggers ttf.
//
// Cached for ~30 days via ISR — Google's font URLs are content-hashed so
// refreshes are safe.
async function loadGoogleFont(query: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?${query}&display=swap`
  const css = await fetch(cssUrl, {
    headers: {
      // Chrome 36 — predates Google's woff2 default, forces ttf fallback.
      // Bumping to a modern UA breaks the build (Satori can't read woff2).
      'User-Agent':
        'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.143 Safari/537.36',
    },
    next: { revalidate: 60 * 60 * 24 * 30 },
  })
  if (!css.ok) {
    throw new Error(`Google Fonts CSS failed: ${css.status} for ${query}`)
  }
  const text = await css.text()
  // Match truetype, opentype, or woff — anything Satori can actually decode.
  const match = text.match(
    /src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"](truetype|opentype|woff)['"]\)/,
  )
  if (!match?.[1]) {
    throw new Error(
      `Couldn't extract TTF/OTF font URL from CSS for ${query}. ` +
        `CSS sample: ${text.slice(0, 200)}`,
    )
  }
  const fontRes = await fetch(match[1], {
    next: { revalidate: 60 * 60 * 24 * 30 },
  })
  if (!fontRes.ok) {
    throw new Error(`Font binary fetch failed: ${fontRes.status}`)
  }
  return fontRes.arrayBuffer()
}

export default async function OpenGraphImage() {
  // Load all three faces in parallel — fetched once per cold start, then
  // served from the ISR cache for ~30 days.
  const [cinzel700, cinzelBlack, garamond400, garamondItalic] =
    await Promise.all([
      loadGoogleFont('family=Cinzel:wght@700'),
      loadGoogleFont('family=Cinzel:wght@900'),
      loadGoogleFont('family=EB+Garamond:wght@400'),
      loadGoogleFont('family=EB+Garamond:ital@1'),
    ])

  // Palette — same OKLCH values as globals.css, sRGB-converted for Satori.
  const oxblood = '#7A1B23'
  const oxbloodDark = '#5C1318'
  const gold = '#D5A24D'
  const goldDeep = '#A8772E'
  const parchmentLight = '#FAEFC9'
  const parchmentMid = '#E8C982'
  const parchmentDark = '#B89855'
  const ink = '#2A1F16'
  const inkMuted = '#5A4838'

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
          // Aged parchment — warm radial from a lit centre to darker edges.
          background: `radial-gradient(ellipse at center, ${parchmentLight} 0%, ${parchmentMid} 65%, ${parchmentDark} 100%)`,
          position: 'relative',
          fontFamily: 'EB Garamond, Georgia, serif',
          color: ink,
        }}
      >
        {/* Vignette — warm sepia darkening at the corners for depth. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'radial-gradient(ellipse at center, transparent 45%, rgba(60, 35, 18, 0.40) 100%)',
          }}
        />

        {/* Outer gold frame — thick, slightly inset, the dominant border. */}
        <div
          style={{
            position: 'absolute',
            inset: 28,
            display: 'flex',
            border: `3px solid ${gold}`,
            borderRadius: 10,
            opacity: 0.75,
            boxShadow:
              `inset 0 0 32px rgba(168, 119, 46, 0.35), 0 2px 8px rgba(0, 0, 0, 0.15)`,
          }}
        />

        {/* Inner hairline — a second beat for that ornamented frame look. */}
        <div
          style={{
            position: 'absolute',
            inset: 46,
            display: 'flex',
            border: `1px solid ${gold}`,
            borderRadius: 6,
            opacity: 0.35,
          }}
        />

        {/* Corner accents — small diamonds at each corner of the inner
            frame. Tiny detail; reads as deliberate craft. */}
        {(
          [
            { top: 38, left: 38 },
            { top: 38, right: 38 },
            { bottom: 38, left: 38 },
            { bottom: 38, right: 38 },
          ] as const
        ).map((pos, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              display: 'flex',
              width: 16,
              height: 16,
              background: gold,
              transform: 'rotate(45deg)',
              boxShadow: '0 0 8px rgba(168, 119, 46, 0.5)',
            }}
          />
        ))}

        {/* Top kicker — small tracked-caps line above the wordmark.
            Reads as a Renaissance-court flourish. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'EB Garamond, Georgia, serif',
            fontSize: 22,
            color: goldDeep,
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 8,
            // Slight text shadow for depth on the gold-on-parchment.
            textShadow: '0 1px 2px rgba(60, 35, 18, 0.2)',
          }}
        >
          A Court of Influence
        </div>

        {/* COUP — Cinzel 900 (heavier than the in-app wordmark to fill the
            card), oxblood, with both a soft drop shadow AND a warm gold
            glow to feel etched / illuminated. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'Cinzel, Georgia, serif',
            fontWeight: 900,
            fontSize: 232,
            color: oxblood,
            letterSpacing: '0.08em',
            lineHeight: 1,
            textShadow:
              `0 4px 12px rgba(92, 19, 24, 0.35), 0 0 40px rgba(213, 162, 77, 0.45), 0 1px 0 ${oxbloodDark}`,
          }}
        >
          COUP
        </div>

        {/* Online — tracked uppercase, gold, sits just under the title. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'Cinzel, Georgia, serif',
            fontWeight: 700,
            fontSize: 42,
            color: goldDeep,
            letterSpacing: '0.65em',
            textTransform: 'uppercase',
            marginTop: 4,
            textShadow: '0 1px 2px rgba(60, 35, 18, 0.3)',
          }}
        >
          Online
        </div>

        {/* Ornament — line / diamond / line. Classic frontispiece motif. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginTop: 28,
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 160,
              height: 1.5,
              background: gold,
              boxShadow: '0 0 6px rgba(168, 119, 46, 0.5)',
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 12,
              height: 12,
              background: gold,
              transform: 'rotate(45deg)',
              boxShadow: '0 0 8px rgba(168, 119, 46, 0.6)',
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 160,
              height: 1.5,
              background: gold,
              boxShadow: '0 0 6px rgba(168, 119, 46, 0.5)',
            }}
          />
        </div>

        {/* Tagline — EB Garamond italic, the body voice of the site. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'EB Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 38,
            color: ink,
            marginTop: 22,
            textAlign: 'center',
          }}
        >
          Bluff, challenge, and outwit your way to the throne.
        </div>

        {/* Spec line — straight roman, slightly muted. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'EB Garamond, Georgia, serif',
            fontSize: 24,
            color: inkMuted,
            marginTop: 10,
            letterSpacing: '0.08em',
            fontWeight: 500,
          }}
        >
          3 to 6 players · Real-time · Free · No ads
        </div>

        {/* Bottom branded mark — small "coups.app" badge for provenance. */}
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 24,
              height: 1,
              background: gold,
              opacity: 0.6,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'Cinzel, Georgia, serif',
              fontWeight: 700,
              fontSize: 18,
              color: oxblood,
              letterSpacing: '0.35em',
              textTransform: 'uppercase',
            }}
          >
            coups.app
          </div>
          <div
            style={{
              display: 'flex',
              width: 24,
              height: 1,
              background: gold,
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Cinzel',
          data: cinzel700,
          weight: 700,
          style: 'normal',
        },
        {
          name: 'Cinzel',
          data: cinzelBlack,
          weight: 900,
          style: 'normal',
        },
        {
          name: 'EB Garamond',
          data: garamond400,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'EB Garamond',
          data: garamondItalic,
          weight: 400,
          style: 'italic',
        },
      ],
    },
  )
}
