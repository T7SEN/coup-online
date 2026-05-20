import { cn } from '@/lib/utils'

// Loading placeholder — a pulsing muted block. Used by the route-level
// loading.tsx skeletons that stand in for server-rendered content.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
