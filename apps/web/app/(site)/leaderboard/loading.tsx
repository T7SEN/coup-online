import { Skeleton } from '@/components/ui/skeleton'

// Suspense fallback for the leaderboard — shown while the Server Component
// fetches the board from the Worker. Mirrors the page layout (header, champion
// banner, paired runners-up, ranked list) so the swap to real content doesn't
// shift anything. apps/web/app/(site)/leaderboard/page.tsx.
export default function LeaderboardLoading() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 pt-20 sm:p-6 sm:pt-24">
      <div className="mb-9 flex flex-col items-center gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-44" />
        <div className="h-px w-20 bg-gold/60" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[6.5rem] w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-44 rounded-md" />
          <Skeleton className="h-44 rounded-md" />
        </div>
        <ol className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[3.75rem] w-full rounded-md" />
          ))}
        </ol>
      </div>
    </main>
  )
}
