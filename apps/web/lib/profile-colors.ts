// Profile crest banner palette — the fixed preset colors a player can pick
// for the banner strip behind their avatar on the profile page. The chosen
// key is persisted in `user.profileColor` (packages/db schema). A future
// supporter perk will allow a custom banner image (`user.profileImage`),
// which overrides the color when set.
//
// IMPORTANT: the set of keys here must stay in sync with the Worker's
// `PROFILE_COLOR_KEYS` validation set in apps/game-server/src/index.ts.

export interface ProfileColor {
  key: string
  label: string
  // CSS background for the banner strip — a soft top-to-bottom gradient so
  // the avatar sitting on the lower edge always has a little depth behind it.
  banner: string
  // True for pale presets, where the banner pin / rank chip needs a dark
  // treatment instead of a light one to stay legible.
  light: boolean
}

export const PROFILE_COLORS: readonly ProfileColor[] = [
  {
    key: 'parchment',
    label: 'Parchment',
    banner:
      'linear-gradient(160deg, oklch(0.93 0.04 88) 0%, oklch(0.85 0.055 82) 100%)',
    light: true,
  },
  {
    key: 'oxblood',
    label: 'Oxblood',
    banner:
      'linear-gradient(160deg, oklch(0.48 0.15 26) 0%, oklch(0.36 0.12 24) 100%)',
    light: false,
  },
  {
    key: 'gold',
    label: 'Gilt',
    banner:
      'linear-gradient(160deg, oklch(0.8 0.13 86) 0%, oklch(0.66 0.12 80) 100%)',
    light: true,
  },
  {
    key: 'forest',
    label: 'Felt',
    banner:
      'linear-gradient(160deg, oklch(0.42 0.07 152) 0%, oklch(0.3 0.05 152) 100%)',
    light: false,
  },
  {
    key: 'royal',
    label: 'Royal',
    banner:
      'linear-gradient(160deg, oklch(0.46 0.11 268) 0%, oklch(0.33 0.09 266) 100%)',
    light: false,
  },
  {
    key: 'purple',
    label: 'Purple',
    banner:
      'linear-gradient(160deg, oklch(0.47 0.16 312) 0%, oklch(0.33 0.13 308) 100%)',
    light: false,
  },
]

export const DEFAULT_PROFILE_COLOR = 'parchment'

// Resolve a stored key (which may be unknown / null) to its preset, falling
// back to the default so the crest always renders.
export function resolveProfileColor(key: string | null | undefined): ProfileColor {
  return PROFILE_COLORS.find((c) => c.key === key) ?? PROFILE_COLORS[0]
}

// CSS `background-image` for the banner's faint diamond-weave overlay — dark
// on pale presets, light on dark ones. Shared by the editable crest and the
// read-only public-profile crest so they never drift.
export function bannerLatticeImage(preset: ProfileColor): string {
  const c = preset.light ? 'rgba(60,40,10,0.07)' : 'rgba(255,255,255,0.08)'
  return (
    `repeating-linear-gradient(45deg, ${c} 0, ${c} 1px, transparent 1px, transparent 22px), ` +
    `repeating-linear-gradient(-45deg, ${c} 0, ${c} 1px, transparent 1px, transparent 22px)`
  )
}
