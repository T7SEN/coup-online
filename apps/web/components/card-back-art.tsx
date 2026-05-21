import {
  asCardBackSkin,
  type CardBackSkin,
} from '@coup-online/protocol'
import { cn } from '@/lib/utils'

// CardBackArt — full-card back rendering for the in-game InfluenceCard.
// Scales to fill its container at 2:3 (the same aspect as the front-face art
// in public/cards/<name>.svg). Inline SVG, no asset files — adding a new skin
// is one entry in SKIN_COLOURS + a per-skin motif clause.
//
// The default skin (null, or the 'parchment' override) keeps using the
// existing public/cards/back.svg via <img> so the marketing pages and any
// other site that already loads back.svg stay visually identical.
//
// Symmetry: the four skins here mirror the four in CardBackPreview (the
// Settings picker). They share keys via `@coup-online/protocol` so the wire
// value can never name a skin that has no art.

const SKIN_COLOURS: Record<
  CardBackSkin,
  { ground: string; motif: string; rim: string }
> = {
  parchment: {
    ground: 'oklch(0.96 0.025 88)',
    motif: 'oklch(0.74 0.13 84)',
    rim: 'oklch(0.74 0.13 84)',
  },
  oxblood: {
    ground: 'oklch(0.32 0.11 25)',
    motif: 'oklch(0.85 0.07 84)',
    rim: 'oklch(0.74 0.13 84)',
  },
  forest: {
    ground: 'oklch(0.30 0.045 152)',
    motif: 'oklch(0.82 0.10 84)',
    rim: 'oklch(0.74 0.13 84)',
  },
  ivory: {
    ground: 'oklch(0.97 0.012 90)',
    motif: 'oklch(0.74 0.13 84)',
    rim: 'oklch(0.74 0.13 84)',
  },
}

// One central motif per skin, scaled for a 400×600 viewBox. Each is built out
// of simple primitives that stay legible at small thumbnail sizes too.
function CentralMotif({ skin }: { skin: CardBackSkin }) {
  const c = SKIN_COLOURS[skin]
  switch (skin) {
    case 'parchment':
      return (
        <g>
          {/* Large gold diamond outline. */}
          <rect
            x="140"
            y="240"
            width="120"
            height="120"
            transform="rotate(45 200 300)"
            fill="none"
            stroke={c.motif}
            strokeWidth="6"
          />
          {/* Inner diamond. */}
          <rect
            x="170"
            y="270"
            width="60"
            height="60"
            transform="rotate(45 200 300)"
            fill="none"
            stroke={c.motif}
            strokeWidth="3"
          />
          {/* Centre dot. */}
          <circle cx="200" cy="300" r="8" fill={c.motif} />
        </g>
      )
    case 'oxblood':
      return (
        <g stroke={c.motif} strokeLinecap="round">
          {/* Heraldic cross. */}
          <line x1="200" y1="200" x2="200" y2="400" strokeWidth="8" />
          <line x1="120" y1="300" x2="280" y2="300" strokeWidth="8" />
          {/* Arms. */}
          <line x1="200" y1="200" x2="180" y2="220" strokeWidth="6" />
          <line x1="200" y1="200" x2="220" y2="220" strokeWidth="6" />
          <line x1="200" y1="400" x2="180" y2="380" strokeWidth="6" />
          <line x1="200" y1="400" x2="220" y2="380" strokeWidth="6" />
          <line x1="120" y1="300" x2="140" y2="280" strokeWidth="6" />
          <line x1="120" y1="300" x2="140" y2="320" strokeWidth="6" />
          <line x1="280" y1="300" x2="260" y2="280" strokeWidth="6" />
          <line x1="280" y1="300" x2="260" y2="320" strokeWidth="6" />
          {/* Centre boss. */}
          <circle cx="200" cy="300" r="14" fill={c.motif} stroke="none" />
        </g>
      )
    case 'forest':
      return (
        <g fill="none" stroke={c.motif} strokeWidth="5">
          {/* Quatrefoil — four overlapping circles, gold rims. */}
          <circle cx="200" cy="240" r="38" />
          <circle cx="200" cy="360" r="38" />
          <circle cx="140" cy="300" r="38" />
          <circle cx="260" cy="300" r="38" />
          <circle cx="200" cy="300" r="14" fill={c.motif} stroke="none" />
        </g>
      )
    case 'ivory':
      return (
        <g stroke={c.motif} strokeWidth="5" strokeLinecap="round">
          {/* Eight-pointed star. */}
          <line x1="200" y1="220" x2="200" y2="380" />
          <line x1="120" y1="300" x2="280" y2="300" />
          <line x1="143" y1="243" x2="257" y2="357" />
          <line x1="257" y1="243" x2="143" y2="357" />
          <circle cx="200" cy="300" r="10" fill={c.motif} stroke="none" />
        </g>
      )
  }
}

// Repeating lattice — diagonal cross-hatch that adds texture to the field
// behind the central motif. Subtle (low alpha) so it reads as weave, not
// pattern. Common to every skin; the gold tone comes from the motif colour.
function FieldLattice({ skin }: { skin: CardBackSkin }) {
  const c = SKIN_COLOURS[skin]
  return (
    <g stroke={c.motif} strokeOpacity="0.18" strokeWidth="1">
      {Array.from({ length: 14 }, (_, i) => {
        const offset = i * 80 - 400
        return (
          <g key={i}>
            <line x1={offset} y1={0} x2={offset + 600} y2={600} />
            <line x1={offset} y1={600} x2={offset + 600} y2={0} />
          </g>
        )
      })}
    </g>
  )
}

export function CardBackArt({
  skin,
  className,
}: {
  // Accepts the wire shape (string | null | undefined) and narrows; unknown
  // strings fall through to the parchment fallback below.
  skin: string | null | undefined
  className?: string
}) {
  const known = asCardBackSkin(skin)

  // Default / parchment override → reuse the existing card back. Keeps
  // marketing pages and the default game look identical to before.
  if (known == null || known === 'parchment') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/cards/back.svg"
        alt=""
        className={cn('block size-full object-cover', className)}
      />
    )
  }

  const c = SKIN_COLOURS[known]
  return (
    <svg
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn('block size-full', className)}
    >
      {/* Ground. */}
      <rect x="0" y="0" width="400" height="600" rx="22" fill={c.ground} />
      {/* Field lattice — clipped to the inner panel via a clip rectangle. */}
      <defs>
        <clipPath id={`card-back-${known}-clip`}>
          <rect x="22" y="22" width="356" height="556" rx="14" />
        </clipPath>
      </defs>
      <g clipPath={`url(#card-back-${known}-clip)`}>
        <FieldLattice skin={known} />
      </g>
      {/* Outer gilt border. */}
      <rect
        x="14"
        y="14"
        width="372"
        height="572"
        rx="18"
        fill="none"
        stroke={c.rim}
        strokeOpacity="0.7"
        strokeWidth="3"
      />
      {/* Inner gilt rule — thinner. */}
      <rect
        x="22"
        y="22"
        width="356"
        height="556"
        rx="14"
        fill="none"
        stroke={c.rim}
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <CentralMotif skin={known} />
    </svg>
  )
}
