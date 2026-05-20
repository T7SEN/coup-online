import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Shared presentational pieces for the profile pages — the signed-in user's
// own profile (./page.tsx) and any player's public profile
// ([userId]/page.tsx). Pure Server Components.

// Hover treatment for the stat tiles + match rows.
export const HOVER =
  'transition duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md'

// One point on the rating-over-time graph. The Worker sends these newest-first.
export interface RatingPoint {
  at: number
  rating: number
}

// Section heading — Cinzel, with a short gold rule beneath.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="font-display text-lg tracking-wide">{children}</h2>
      <div className="h-px w-12 bg-gold/40" />
    </div>
  )
}

// A rating-over-time chart — a soft gradient area under the line, plus the net
// change. `history` arrives newest-first.
export function RatingTrendCard({ history }: { history: RatingPoint[] }) {
  if (history.length < 2) return null
  const points = [...history].reverse() // chronological, left → right
  const ratings = points.map((p) => p.rating)
  const min = Math.min(...ratings)
  const max = Math.max(...ratings)
  const span = max - min || 1
  const width = 100
  const height = 32
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((p.rating - min) / span) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = coords.join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  const net = points[points.length - 1].rating - points[0].rating

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Rating trend</SectionTitle>
          <span
            className={cn(
              'font-display text-sm tabular-nums',
              net >= 0 ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {net >= 0 ? '+' : '−'}
            {Math.abs(net)}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-16 w-full text-gold"
          aria-hidden
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#trendFill)" />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </CardContent>
    </Card>
  )
}

// A single record tile — a big value over a small label.
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-md border border-gold/20 bg-card/50 px-3 py-4 text-center',
        HOVER,
      )}
    >
      <span className="font-display text-2xl tabular-nums">{value}</span>
      <span className="text-xs tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
