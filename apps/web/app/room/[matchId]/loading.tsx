import { Skeleton } from '@/components/ui/skeleton'

// Suspense fallback for the game room — shown briefly while the Server
// Component awaits the session check before handing off to the WebSocket
// client. A minimal centred placeholder evoking a hand at the table.
// apps/web/app/room/[matchId]/page.tsx.
export default function RoomLoading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-4">
      <Skeleton className="h-7 w-52" />
      <div className="flex gap-3">
        <Skeleton className="aspect-2/3 w-24 rounded-lg" />
        <Skeleton className="aspect-2/3 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-40" />
    </main>
  )
}
