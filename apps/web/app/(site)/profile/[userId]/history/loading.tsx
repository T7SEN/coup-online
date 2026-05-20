import { Skeleton } from '@/components/ui/skeleton'

// Suspense fallback for the dedicated match-history page — shown while the
// Server Component fetches /api/me/profile + /api/me/matches from the Worker.
// Mirrors the page layout (back link, header strip, record tiles, list rows).
// history/page.tsx.
export default function HistoryLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24">
      <Skeleton className="mb-6 h-5 w-40" />

      {/* Header — kicker, title, divider, lede. */}
      <header className="flex flex-col items-center gap-3 text-center">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-px w-48" />
        <Skeleton className="h-5 w-72" />
      </header>

      {/* Record strip — 4 tiles. */}
      <div className="mx-auto mt-8 grid w-full max-w-md grid-cols-4 gap-px overflow-hidden rounded-md border border-gold/20 bg-gold/10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1.5 bg-card px-2 py-3"
          >
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>

      {/* Six placeholder rows. */}
      <ol className="mt-10 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-4 rounded-md border border-border bg-card px-4 py-3"
          >
            <Skeleton className="h-7 w-20 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-10" />
          </li>
        ))}
      </ol>
    </main>
  )
}
