import { AlertTriangle } from 'lucide-react'
import { GAME_SERVER_HTTP } from '@/lib/config'

// Maintenance banner — a thin yellow strip pinned above the page content
// whenever the admin has flipped the global maintenance flag (see
// /api/admin/maintenance in the Worker). Server-rendered so signed-out
// visitors see it too without any client-side hydration.
//
// The Worker caches the status endpoint for 60s; Next.js's fetch cache
// honors that, so this only round-trips to the Worker once per minute
// per build. On a fetch failure we render nothing rather than a banner
// or the /maintenance page — a transient Worker hiccup shouldn't flash
// an alarming "we're offline" message at every visitor. The /maintenance
// page handled by fetchWorker covers hard outages.
//
// Layout integration: imported by app/layout.tsx and rendered above
// {children}. Async server component — fine to use inside the (also
// async-capable) RootLayout function.

interface SiteStatus {
  maintenance: {
    enabled: boolean
    message: string
  }
}

async function fetchSiteStatus(): Promise<SiteStatus | null> {
  try {
    const res = await fetch(`${GAME_SERVER_HTTP}/api/site/status`, {
      // Honor the Worker's Cache-Control: max-age=60. next.revalidate keeps
      // the Next.js fetch cache aligned with the upstream max-age, so we
      // don't hit the Worker more often than once per minute per build.
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return (await res.json()) as SiteStatus
  } catch {
    return null
  }
}

export async function MaintenanceBanner() {
  const status = await fetchSiteStatus()
  if (!status?.maintenance.enabled) return null

  const message =
    status.maintenance.message.trim() ||
    'Coup Online is briefly offline for maintenance. Matches are paused.'

  return (
    <div
      role="status"
      aria-live="polite"
      // Sits between the body and the content column. `relative z-50` keeps
      // it above the navbar's translucent backdrop without affecting layout.
      className="relative z-50 border-b border-gold/40 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100 backdrop-blur"
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </span>
    </div>
  )
}
