import { asTableTheme, type TableTheme } from '@coup-online/protocol'

// Table-theme → CSS-variable overrides applied inline on the room's table
// wrapper. The default `--table` / `--table-foreground` come from
// globals.css (`:root`); these overrides swap them per-room for patrons who
// hosted with a theme. The radial vignette painted on top of the felt is
// also re-coloured so the wash reads as part of the same palette.
//
// Each value is an oklch() string that drops straight into a CSS variable.
// Tailwind's `bg-table` resolves to `var(--color-table)` (which the theme
// re-exports as `--table` in globals.css `@theme inline`); writing
// `--color-table` overrides the resolved value for descendants.

interface ThemeVars {
  // bg-table
  ['--color-table']: string
  // text-table-foreground
  ['--color-table-foreground']: string
  // Custom token consumed by the room's radial-vignette gradient; see
  // client.tsx where `--table-vignette` is read.
  ['--table-vignette']: string
}

const THEMES: Record<TableTheme, ThemeVars> = {
  standard: {
    '--color-table': 'oklch(0.31 0.035 152)',
    '--color-table-foreground': 'oklch(0.93 0.02 88)',
    '--table-vignette': 'oklch(0.44 0.05 152 / 0.5)',
  },
  'oxblood-court': {
    '--color-table': 'oklch(0.32 0.11 25)',
    '--color-table-foreground': 'oklch(0.95 0.02 88)',
    '--table-vignette': 'oklch(0.46 0.14 25 / 0.5)',
  },
  forest: {
    '--color-table': 'oklch(0.28 0.05 145)',
    '--color-table-foreground': 'oklch(0.94 0.02 88)',
    '--table-vignette': 'oklch(0.40 0.06 145 / 0.5)',
  },
  midnight: {
    '--color-table': 'oklch(0.20 0.035 260)',
    '--color-table-foreground': 'oklch(0.93 0.02 88)',
    '--table-vignette': 'oklch(0.34 0.06 260 / 0.5)',
  },
}

// Resolve a (possibly unknown) wire value to an inline-style object the
// room's table wrapper can spread. Returns an empty object when the theme is
// null / unknown — the global :root defaults stand.
export function tableThemeStyle(
  theme: string | null | undefined,
): React.CSSProperties {
  const known = asTableTheme(theme)
  if (known == null || known === 'standard') {
    // 'standard' explicitly matches the globals.css default — no override
    // needed (saves a couple of inline declarations on the common path).
    return {}
  }
  return THEMES[known] as unknown as React.CSSProperties
}
