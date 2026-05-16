import { cn } from '@/lib/utils'

// The "COUP Online" wordmark. Cinzel inscriptional capitals — oxblood "COUP",
// a tracked muted-caps "Online" suffix on the same baseline. references/design-system.md.
const SIZES = {
  sm: { coup: 'text-lg', online: 'text-[0.65rem]' },
  md: { coup: 'text-2xl', online: 'text-xs' },
  lg: { coup: 'text-5xl sm:text-6xl', online: 'text-base sm:text-lg' },
} as const

export function Logo({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 font-display', className)}>
      <span className={cn('font-bold tracking-[0.12em] text-primary', s.coup)}>COUP</span>
      <span className={cn('uppercase tracking-[0.3em] text-muted-foreground', s.online)}>
        Online
      </span>
    </span>
  )
}
