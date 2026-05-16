import type { PlayerSeat } from '@coup-online/protocol'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { InfluenceCard } from './influence-card'

// One player's seat in the game grid. Gold border = it's their turn; faded =
// eliminated. Coins render as a gold "ducat" chip. references/design-system.md.
export function SeatCard({
  seat,
  isTurn,
}: {
  seat: PlayerSeat
  isTurn: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-3 ring-1 ring-foreground/5 transition-colors',
        isTurn && seat.isAlive && 'border-gold ring-gold/40',
        !seat.isAlive && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-[0.6rem]">
              {seat.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span dir="auto" className="truncate font-medium">
            {seat.displayName}
          </span>
          {seat.isMe && (
            <span className="shrink-0 text-xs text-muted-foreground">(you)</span>
          )}
        </span>
        <span
          className="flex shrink-0 items-center gap-1 text-sm tabular-nums"
          title={`${seat.coins} coin${seat.coins === 1 ? '' : 's'}`}
        >
          <span className="size-2.5 rounded-full bg-gold ring-1 ring-gold-foreground/25" />
          {seat.coins}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {seat.influence.map((inf, i) => (
          <InfluenceCard key={i} influence={inf} />
        ))}
        {seat.isDisconnected && seat.isAlive && (
          <Badge variant="outline" className="text-muted-foreground">
            disconnected
          </Badge>
        )}
        {!seat.isAlive && <Badge variant="destructive">eliminated</Badge>}
      </div>
    </div>
  )
}
