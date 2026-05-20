import { ScrollToTop } from '@/components/site/scroll-to-top'
import { SiteNavbar } from '@/components/site-navbar'

// Layout for the site pages — home, rules, leaderboard, profile. Adds the
// global Navbar above the page and the floating scroll-to-top control (shared
// by every page in this group). The game room and sign-in sit OUTSIDE this
// route group, so they stay chrome-free (the game keeps its own header). The
// Footer is global and lives in the root layout, so it appears under these
// pages too.
//
// `(site)` is a route group — the parentheses are stripped from the URL:
// app/(site)/page.tsx is `/`, app/(site)/leaderboard is `/leaderboard`, etc.
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SiteNavbar />
      {children}
      <ScrollToTop />
    </>
  )
}
