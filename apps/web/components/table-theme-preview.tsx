import { cn } from '@/lib/utils'

// TableThemePreview — a small inline-SVG swatch showing one of the four
// table felts available to patrons. Used in the Settings Patronage picker
// today; once Phase 4 wires the in-room renderer, the same key (see
// TABLE_THEMES in apps/game-server/src/index.ts) will drive the actual
// table felt + ornament colours in the live game room.
//
// Each swatch is a vignetted rectangle of felt with a small ornament curve
// at the centre, hinting at the table's character without committing to a
// full preview.

export const TABLE_THEMES = [
  'standard',
  'oxblood-court',
  'forest',
  'midnight',
] as const
export type TableTheme = (typeof TABLE_THEMES)[number]

export const TABLE_THEME_LABEL: Record<TableTheme, string> = {
  standard: 'Standard',
  'oxblood-court': 'Oxblood Court',
  forest: 'Forest',
  midnight: 'Midnight',
}

const THEME_COLOURS: Record<
  TableTheme,
  { felt: string; rim: string; ornament: string }
> = {
  standard: {
    felt: 'oklch(0.31 0.035 152)',
    rim: 'oklch(0.22 0.03 152)',
    ornament: 'oklch(0.78 0.12 84)',
  },
  'oxblood-court': {
    felt: 'oklch(0.32 0.11 25)',
    rim: 'oklch(0.22 0.10 25)',
    ornament: 'oklch(0.84 0.10 84)',
  },
  forest: {
    felt: 'oklch(0.28 0.05 145)',
    rim: 'oklch(0.20 0.04 145)',
    ornament: 'oklch(0.80 0.11 84)',
  },
  midnight: {
    felt: 'oklch(0.20 0.035 260)',
    rim: 'oklch(0.14 0.03 260)',
    ornament: 'oklch(0.82 0.12 84)',
  },
}

export function TableThemePreview({
  theme,
  selected,
  className,
}: {
  theme: TableTheme
  selected?: boolean
  className?: string
}) {
  const c = THEME_COLOURS[theme]
  return (
    <svg
      viewBox="0 0 80 60"
      aria-hidden
      className={cn(
        'h-auto w-full rounded-md border transition-shadow',
        selected
          ? 'border-gold/80 shadow-[0_0_10px_-2px_oklch(0.74_0.13_84_/_0.5)]'
          : 'border-gold/35',
        className,
      )}
    >
      {/* The outer felt — a slightly darker rim. */}
      <rect x="0" y="0" width="80" height="60" rx="4" fill={c.rim} />
      {/* The inner felt. */}
      <rect x="6" y="6" width="68" height="48" rx="3" fill={c.felt} />
      {/* Soft vignette. */}
      <radialGradient id={`vignette-${theme}`} cx="50%" cy="40%" r="70%">
        <stop offset="0%" stopColor="white" stopOpacity="0.06" />
        <stop offset="100%" stopColor="black" stopOpacity="0.18" />
      </radialGradient>
      <rect
        x="6"
        y="6"
        width="68"
        height="48"
        rx="3"
        fill={`url(#vignette-${theme})`}
      />
      {/* Central gold ornament — a small curve, hinting at "the court". */}
      <path
        d="M 28 30 Q 40 22 52 30"
        fill="none"
        stroke={c.ornament}
        strokeOpacity="0.65"
        strokeWidth="1"
      />
      <circle cx="40" cy="30" r="1.6" fill={c.ornament} fillOpacity="0.75" />
    </svg>
  )
}
