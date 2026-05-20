import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Suspense fallback for a public player profile — shown while the Server
// Component fetches /api/profile/:userId from the Worker. Mirrors the page
// layout (back link, identity crest, record tiles, rating trend). No match
// list — match history is participant-only. [userId]/page.tsx.
export default function PublicProfileLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <Skeleton className="mb-4 h-5 w-28" />
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-gold/40 shadow-md">
          <div className="relative h-28 bg-muted sm:h-32">
            <div className="absolute bottom-0 left-6 translate-y-1/2 sm:left-8">
              <Skeleton className="size-24 rounded-full ring-4 ring-card" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 bg-card px-6 pt-16 pb-6 sm:px-8">
            <div className="flex flex-col items-start gap-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-12 w-20" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 rounded-md border border-gold/20 bg-card/50 px-3 py-4"
            >
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
