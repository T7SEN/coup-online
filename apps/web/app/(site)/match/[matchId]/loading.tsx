import { Skeleton } from '@/components/ui/skeleton'

// Suspense fallback for the match-summary page — shown while the Server
// Component fetches /api/me/matches/:matchId. Mirrors the layout: back link,
// header, winner banner, standing rows. [matchId]/page.tsx.
export default function MatchLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <Skeleton className="mb-4 h-5 w-28" />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-3 w-52" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      </div>
    </main>
  )
}
