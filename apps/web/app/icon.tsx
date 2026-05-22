import { ImageResponse } from 'next/og'

// Browser-tab favicon at /icon (32×32 PNG). Generated dynamically by
// Next.js — no shipped image file. Renders a single typographic "C" in
// oxblood-on-parchment, matching the site palette.
//
// Why dynamic rather than a static favicon.ico? Two reasons: (1) no
// rasterized logo asset to ship — the wordmark elsewhere on the site is
// pure typography too; (2) trivial to update if the brand colour shifts.

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#7E1F1F',
          color: '#F8F2E2',
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: '0.02em',
          // Slight top nudge so the cap-height sits visually centered.
          paddingBottom: 2,
        }}
      >
        C
      </div>
    ),
    { ...size },
  )
}
