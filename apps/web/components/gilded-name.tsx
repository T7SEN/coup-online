import { cn } from '@/lib/utils'

// GildedName — a name rendered in gold leaf when the user has the
// patron-gilded-nickname privilege turned on. When `gilded` is false the
// component is transparent (returns a normal <span> with no extra styling),
// so it's safe to wrap every displayName regardless of patron state.
//
// Visually: a vertical gradient through the gold token, clipped to the text.
// The gradient gives a touch of depth that flat `text-gold` doesn't — it
// reads more like "gilt" than "highlighted". Pure Server Component (no
// interactivity, just CSS).
//
// The class is exported as `GILDED_CLASS` for the rare site that already has
// its own complex span (e.g. truncating containers) and just wants to apply
// the gold-leaf treatment via cn() rather than wrap.

export const GILDED_CLASS =
  'bg-gradient-to-b from-[oklch(0.86_0.15_84)] to-[oklch(0.62_0.12_84)] bg-clip-text text-transparent font-medium'

export function GildedName({
  name,
  gilded,
  dir,
  className,
}: {
  name: string
  gilded: boolean
  dir?: 'auto'
  className?: string
}) {
  return (
    <span dir={dir} className={cn(gilded && GILDED_CLASS, className)}>
      {name}
    </span>
  )
}
