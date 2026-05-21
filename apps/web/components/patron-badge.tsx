import { BadgeCheck, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

// PatronBadge — the supporter crest shown next to a patron's name. Two
// flavours:
//
//   • Founder: a gilded crown chip carrying the Roman-numeral rank (I–X).
//     Reserved for the first ten patrons ever granted. Founder rank survives
//     revocation, so this badge can render for someone whose `isPatron` is
//     now false — they earned the slot once and they keep the mark.
//
//   • Patron (non-founder): the BadgeCheck crest, no numeral.
//
// Renders nothing when neither condition holds (the common case for ordinary
// users). Pure Server Component — no hooks, no state.

const ROMAN = [
  '',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
] as const

type Size = 'xs' | 'sm' | 'md'

// Geometry per size. Padding + icon size + numeral size are bundled together
// so a single `size` prop covers every dimension.
const SIZES: Record<
  Size,
  { chip: string; icon: string; label: string }
> = {
  xs: {
    chip: 'h-4 gap-0.5 px-1 text-[8px]',
    icon: 'size-2.5',
    label: 'tracking-wider',
  },
  sm: {
    chip: 'h-5 gap-1 px-1.5 text-[10px]',
    icon: 'size-3',
    label: 'tracking-wider',
  },
  md: {
    chip: 'h-6 gap-1 px-2 text-xs',
    icon: 'size-3.5',
    label: 'tracking-wider',
  },
}

export function PatronBadge({
  isPatron,
  founderRank,
  size = 'sm',
  className,
}: {
  isPatron: boolean
  founderRank?: number | null
  size?: Size
  className?: string
}) {
  const isFounder =
    founderRank != null &&
    Number.isInteger(founderRank) &&
    founderRank >= 1 &&
    founderRank <= 10
  if (!isFounder && !isPatron) return null

  const dim = SIZES[size]

  if (isFounder) {
    const numeral = ROMAN[founderRank as number]
    return (
      <span
        aria-label={`Founding patron — ${numeral}`}
        title={`Founding patron · ${numeral}`}
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border border-gold/65 bg-gold/15 font-display font-medium text-gold shadow-[0_0_8px_-2px_oklch(0.74_0.13_84_/_0.4)] uppercase',
          dim.chip,
          className,
        )}
      >
        <Crown className={dim.icon} aria-hidden />
        <span className={cn('tabular-nums', dim.label)}>{numeral}</span>
      </span>
    )
  }

  // Non-founder supporter.
  return (
    <span
      aria-label="Patron"
      title="Patron"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-gold/45 bg-gold/10 text-gold',
        // For the non-founder version we drop the inline padding — it's a
        // simple icon chip, not a labelled one.
        size === 'xs' ? 'size-4' : size === 'sm' ? 'size-5' : 'size-6',
        className,
      )}
    >
      <BadgeCheck className={dim.icon} aria-hidden />
    </span>
  )
}
