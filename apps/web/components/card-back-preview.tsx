import { cn } from '@/lib/utils'

// CardBackPreview — a small inline-SVG swatch showing one of the four card-
// back skins available to patrons. Used in the Settings Patronage picker
// today; once Phase 4 wires the in-room renderer, the same key (see
// CARD_BACK_SKINS in apps/game-server/src/index.ts) will drive the actual
// face-down card art in matches.
//
// Designs are deliberately simple — small inline SVGs, no extra files, no
// asset pipeline. Each is a coloured ground with a centred gold motif and a
// gilt border.

export const CARD_BACK_SKINS = [
  'parchment',
  'oxblood',
  'forest',
  'ivory',
] as const
export type CardBackSkin = (typeof CARD_BACK_SKINS)[number]

// Human labels for the skin selector.
export const CARD_BACK_LABEL: Record<CardBackSkin, string> = {
  parchment: 'Parchment',
  oxblood: 'Oxblood',
  forest: 'Forest',
  ivory: 'Ivory',
}

// Ground + motif colour pairs for each skin. Drives the inline SVG.
const SKIN_COLOURS: Record<
  CardBackSkin,
  { ground: string; motif: string; border: string }
> = {
  parchment: {
    ground: 'oklch(0.96 0.025 88)',
    motif: 'oklch(0.74 0.13 84)',
    border: 'oklch(0.74 0.13 84)',
  },
  oxblood: {
    ground: 'oklch(0.32 0.11 25)',
    motif: 'oklch(0.85 0.07 84)',
    border: 'oklch(0.74 0.13 84)',
  },
  forest: {
    ground: 'oklch(0.30 0.045 152)',
    motif: 'oklch(0.82 0.10 84)',
    border: 'oklch(0.74 0.13 84)',
  },
  ivory: {
    ground: 'oklch(0.97 0.012 90)',
    motif: 'oklch(0.74 0.13 84)',
    border: 'oklch(0.74 0.13 84)',
  },
}

// Per-skin motif — a tiny SVG <g> inserted into the centre of the card.
function Motif({ skin }: { skin: CardBackSkin }) {
  const c = SKIN_COLOURS[skin]
  switch (skin) {
    case 'parchment':
      // A simple diamond — the existing default treatment.
      return (
        <g>
          <rect
            x="22"
            y="32"
            width="16"
            height="16"
            rx="1"
            transform="rotate(45 30 40)"
            fill="none"
            stroke={c.motif}
            strokeWidth="1.4"
          />
          <circle cx="30" cy="40" r="2" fill={c.motif} />
        </g>
      )
    case 'oxblood':
      // A short heraldic cross.
      return (
        <g stroke={c.motif} strokeWidth="2" strokeLinecap="round">
          <line x1="30" y1="26" x2="30" y2="54" />
          <line x1="18" y1="40" x2="42" y2="40" />
          <circle cx="30" cy="40" r="3" fill={c.motif} stroke="none" />
        </g>
      )
    case 'forest':
      // A quatrefoil — four overlapping circles.
      return (
        <g fill="none" stroke={c.motif} strokeWidth="1.4">
          <circle cx="30" cy="32" r="5" />
          <circle cx="30" cy="48" r="5" />
          <circle cx="22" cy="40" r="5" />
          <circle cx="38" cy="40" r="5" />
        </g>
      )
    case 'ivory':
      // An eight-pointed star — minimal lines.
      return (
        <g stroke={c.motif} strokeWidth="1.4" strokeLinecap="round">
          <line x1="30" y1="28" x2="30" y2="52" />
          <line x1="18" y1="40" x2="42" y2="40" />
          <line x1="22" y1="32" x2="38" y2="48" />
          <line x1="38" y1="32" x2="22" y2="48" />
        </g>
      )
  }
}

export function CardBackPreview({
  skin,
  selected,
  className,
}: {
  skin: CardBackSkin
  selected?: boolean
  className?: string
}) {
  const c = SKIN_COLOURS[skin]
  return (
    <svg
      viewBox="0 0 60 80"
      aria-hidden
      className={cn(
        'h-auto w-full max-w-16 rounded-sm border transition-shadow',
        selected
          ? 'border-gold/80 shadow-[0_0_10px_-2px_oklch(0.74_0.13_84_/_0.5)]'
          : 'border-gold/35',
        className,
      )}
    >
      {/* Ground. */}
      <rect x="0" y="0" width="60" height="80" rx="3" fill={c.ground} />
      {/* Gilt double border. */}
      <rect
        x="3"
        y="3"
        width="54"
        height="74"
        rx="2"
        fill="none"
        stroke={c.border}
        strokeOpacity="0.55"
        strokeWidth="0.8"
      />
      <rect
        x="6"
        y="6"
        width="48"
        height="68"
        rx="1.5"
        fill="none"
        stroke={c.border}
        strokeOpacity="0.25"
        strokeWidth="0.5"
      />
      <Motif skin={skin} />
    </svg>
  )
}
