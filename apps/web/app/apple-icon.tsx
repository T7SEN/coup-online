import { ImageResponse } from 'next/og'

// iOS "Add to Home Screen" icon at /apple-icon (180×180 PNG). Same family
// as app/icon.tsx but bigger, with a slightly more substantial mark
// (typographic "C" plus a tiny gold rule beneath — more visible at 180px
// than the bare letter would be).
//
// Rounded corners are added by iOS itself — don't bake them into the image.

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontWeight: 700,
            fontSize: 124,
            letterSpacing: '0.02em',
            lineHeight: 1,
            paddingBottom: 8,
          }}
        >
          C
        </div>
        <div
          style={{
            display: 'flex',
            width: 56,
            height: 3,
            background: '#D5A24D',
            borderRadius: 2,
          }}
        />
      </div>
    ),
    { ...size },
  )
}
