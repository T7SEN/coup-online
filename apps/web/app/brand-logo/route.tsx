import { ImageResponse } from 'next/og'

// /brand-logo — 1024×1024 PNG brand mark for external uses:
//   - Google Cloud Console → OAuth consent screen → App logo
//   - Discord Developer Portal → General Information → App Icon
//   - Future: press kit, partnership inquiries, social profile avatars
//
// Same visual family as app/apple-icon.tsx (oxblood square, ivory "C",
// gold rule beneath) just bigger and with more proportional weight. Square
// because every OAuth provider crops to circle OR square, and a square
// canvas with centered mark works in both crops.
//
// How to use: deploy, open https://coups.app/brand-logo in a browser →
// right-click → Save Image As → upload to Google / Discord. The image is
// generated once and cached forever; safe to fetch repeatedly.

export const dynamic = 'force-static'
export const revalidate = false

export async function GET() {
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
          background: '#7E1F1F',
          color: '#F8F2E2',
          // Georgia is the system serif closest to Cinzel and renders
          // consistently in Satori without the Google Fonts fetch
          // round-trip. At 1024px the difference is invisible — the "C"
          // glyph is essentially the same inscriptional Roman cap.
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontWeight: 700,
            fontSize: 720,
            letterSpacing: '0.02em',
            lineHeight: 1,
            // Optical adjustment — visually centers the cap-height.
            paddingBottom: 40,
          }}
        >
          C
        </div>
        <div
          style={{
            display: 'flex',
            width: 320,
            height: 16,
            background: '#D5A24D',
            borderRadius: 8,
            marginTop: 4,
          }}
        />
      </div>
    ),
    { width: 1024, height: 1024 },
  )
}
