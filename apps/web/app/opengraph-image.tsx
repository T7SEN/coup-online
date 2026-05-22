import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/site-metadata'

// Default Open Graph card at /opengraph-image (1200×630 PNG). Cinematic
// dark-oxblood treatment: the wordmark in cream on a deep maroon
// background reads as theatrical and high-contrast — built to stop a
// thumb-scroll in a Twitter / Slack / Discord feed, not blend in.
//
// Iteration loop (this file is hot-reloaded by Next dev):
//   1. pnpm --filter @coup-online/web dev
//   2. Open http://localhost:3000/opengraph-image in a browser tab
//   3. Edit this file → save → Ctrl+Shift+R in the browser to bust the
//      browser cache → see the new image
//   4. Cinzel + EB Garamond fonts load fresh from Google Fonts in dev
//      (cached for the dev-server lifetime; restart dev to re-fetch)
//
// In production: this route is pre-rendered at build time to a static
// PNG cached at the edge — zero per-request work, same image for every
// social-media crawler.
//
// Twitter shares re-use this asset via app/twitter-image.tsx (same
// dimensions, summary_large_image card).

export const alt = `${SITE.name} — ${SITE.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Pull a single weight/style from Google Fonts. Satori (next/og's
// rendering engine) needs TTF, NOT woff2 — send an old Chrome 36 UA so
// Google serves the ttf fallback. Modern UAs return woff2 which Satori
// rejects with "Unsupported OpenType signature wOF2".
async function loadGoogleFont(query: string): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?${query}&display=swap`
  const css = await fetch(cssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.143 Safari/537.36',
    },
    next: { revalidate: 60 * 60 * 24 * 30 },
  })
  if (!css.ok) {
    throw new Error(`Google Fonts CSS failed: ${css.status} for ${query}`)
  }
  const text = await css.text()
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

// Wrap loadGoogleFont with a per-font try/catch so the whole route doesn't
// 500 if Google Fonts is briefly unavailable. Missing fonts degrade
// gracefully — Satori falls back to Georgia, which looks fine for this
// design (Roman serif silhouette is recognisable).
async function safeLoadGoogleFont(query: string): Promise<ArrayBuffer | null> {
  try {
    return await loadGoogleFont(query)
  } catch (err) {
    console.error(`[opengraph-image] font load failed for ${query}:`, err)
    return null
  }
}

export default async function OpenGraphImage() {
  // Parallel font load — first cold start fetches; thereafter served from
  // the ISR cache (30 days). On localhost the cache lives for the lifetime
  // of `next dev` — restart the dev server to re-fetch.
  const [cinzelHeavy, cinzelRegular, garamond, garamondItalic] =
    await Promise.all([
      safeLoadGoogleFont('family=Cinzel:wght@900'),
      safeLoadGoogleFont('family=Cinzel:wght@700'),
      safeLoadGoogleFont('family=EB+Garamond:wght@400'),
      safeLoadGoogleFont('family=EB+Garamond:ital@1'),
    ])

  // Build the fonts array, filtering out any that failed to load.
  type FontDescriptor = {
    name: string
    data: ArrayBuffer
    weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
    style: 'normal' | 'italic'
  }
  const fonts: FontDescriptor[] = []
  if (cinzelHeavy)
    fonts.push({ name: 'Cinzel', data: cinzelHeavy, weight: 900, style: 'normal' })
  if (cinzelRegular)
    fonts.push({ name: 'Cinzel', data: cinzelRegular, weight: 700, style: 'normal' })
  if (garamond)
    fonts.push({ name: 'EB Garamond', data: garamond, weight: 400, style: 'normal' })
  if (garamondItalic)
    fonts.push({ name: 'EB Garamond', data: garamondItalic, weight: 400, style: 'italic' })

  // Palette — cinematic dark-oxblood. Single dominant accent (cream + gold)
  // keeps the eye on the wordmark; no parchment, no double-frame busyness.
  const bgCenter = '#4D1216' // oxblood, lit
  const bgEdge = '#1A0608' // near-black, vignetted
  const cream = '#F8F2E2' // wordmark + tagline
  const creamMuted = '#C9B89B' // sub-line
  const gold = '#D5A24D' // accents + footer mark
  const goldGlow = 'rgba(213, 162, 77, 0.35)'

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
          // Radial gradient — bright at the centre under the wordmark, dark
          // at the corners. Reads as a spotlit theatre.
          background: `radial-gradient(ellipse at center, ${bgCenter} 0%, ${bgEdge} 95%)`,
          position: 'relative',
          fontFamily: 'EB Garamond, Georgia, serif',
          color: cream,
        }}
      >
        {/* Hairline gold frame, well inset. One frame, restrained — the
            previous version stacked two and read busy. */}
        <div
          style={{
            position: 'absolute',
            inset: 32,
            display: 'flex',
            border: `1.5px solid ${gold}`,
            borderRadius: 8,
            opacity: 0.35,
          }}
        />

        {/* COUP — Cinzel 900, massive, cream. Letter-spacing keeps the
            inscriptional caps breathing. Subtle text-shadow does the
            heavy lifting for depth on dark. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'Cinzel, Georgia, serif',
            fontWeight: 900,
            fontSize: 248,
            color: cream,
            letterSpacing: '0.05em',
            lineHeight: 1,
            textShadow: `0 4px 24px rgba(0, 0, 0, 0.45), 0 0 60px ${goldGlow}`,
          }}
        >
          COUP
        </div>

        {/* Online — tracked uppercase, gold, sits directly under. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'Cinzel, Georgia, serif',
            fontWeight: 700,
            fontSize: 38,
            color: gold,
            letterSpacing: '0.7em',
            textTransform: 'uppercase',
            marginTop: 8,
            // Indent by half the letter-spacing so the visual centre lines
            // up with the COUP above (otherwise the trailing letter-spacing
            // pushes the block left).
            paddingLeft: '0.7em',
            textShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
          }}
        >
          Online
        </div>

        {/* Ornament — line / diamond / line. One small detail, gold, with a
            soft glow. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginTop: 36,
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 140,
              height: 1.5,
              background: gold,
              opacity: 0.7,
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 12,
              height: 12,
              background: gold,
              transform: 'rotate(45deg)',
              boxShadow: `0 0 12px ${goldGlow}`,
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 140,
              height: 1.5,
              background: gold,
              opacity: 0.7,
            }}
          />
        </div>

        {/* Tagline — short, three-word command. Italic Garamond. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'EB Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 44,
            color: cream,
            marginTop: 28,
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          Bluff. Challenge. Outwit.
        </div>

        {/* Spec line — tracked muted caps for that "movie title card"
            credit-line feel. */}
        <div
          style={{
            display: 'flex',
            position: 'relative',
            fontFamily: 'EB Garamond, Georgia, serif',
            fontSize: 20,
            color: creamMuted,
            marginTop: 18,
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          3–6 players · Real-time · Free
        </div>

        {/* Footer brand mark — small "coups.app" in gold tracked caps,
            flanked by short gold rules. Bottom centre, well inside the
            frame. */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 32,
              height: 1,
              background: gold,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontFamily: 'Cinzel, Georgia, serif',
              fontWeight: 700,
              fontSize: 17,
              color: gold,
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
            }}
          >
            coups.app
          </div>
          <div
            style={{
              display: 'flex',
              width: 32,
              height: 1,
              background: gold,
              opacity: 0.5,
            }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    },
  )
}
