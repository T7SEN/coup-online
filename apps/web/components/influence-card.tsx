import type { CardKind, Influence } from '@coup-online/protocol'
import { cn } from '@/lib/utils'

// Per-character ink colors (references/design-system.md) — used for the card
// label so an own / revealed card reads as its character at a glance.
const CHAR_TEXT: Record<CardKind, string> = {
  Duke: 'text-char-duke',
  Assassin: 'text-char-assassin',
  Captain: 'text-char-captain',
  Ambassador: 'text-char-ambassador',
  Contessa: 'text-char-contessa',
}

// One influence card as the viewer sees it (protocol Influence):
//   hidden    — another player's face-down card; a blank parchment back.
//   face-down — the viewer's own card; the character shown in its colour.
//   revealed  — a lost card; character shown, struck through and faded.
export function InfluenceCard({
  influence,
  className,
}: {
  influence: Influence
  className?: string
}) {
  const base =
    'inline-flex h-10 w-[4.75rem] items-center justify-center rounded-md border px-1 text-center text-[0.7rem] leading-tight font-medium select-none'

  if (influence.status === 'hidden') {
    return (
      <span
        className={cn(
          base,
          'border-border bg-secondary text-base text-muted-foreground/55',
          className,
        )}
        aria-label="Hidden card"
      >
        ✦
      </span>
    )
  }

  const lost = influence.status === 'revealed'
  return (
    <span
      className={cn(
        base,
        'bg-card',
        CHAR_TEXT[influence.kind],
        lost ? 'border-destructive/35 line-through opacity-55' : 'border-current/35',
        className,
      )}
      aria-label={lost ? `${influence.kind}, lost` : influence.kind}
    >
      {influence.kind}
    </span>
  )
}
