import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { OrnamentDivider } from '@/components/site/ornament-divider'
import { cn } from '@/lib/utils'

// The Chronicle — the public changelog. Static Server Component; each folio is
// wrapped in the scroll-reveal client island (same pattern as Rules, Privacy,
// Terms). Entries are reverse-chronological. Add a new folio at the TOP of
// FOLIOS to log a release.
//
// references/design-system.md (the parchment + Cinzel theme), and
// references/animations.md (the RevealSection scroll-trigger row).
const RevealSection = dynamic(() =>
  import('@/components/site/reveal-section').then((m) => m.RevealSection),
)

import { pageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Changelog',
  description:
    'Release notes for Coup Online — what shipped, what changed, and what is coming.',
  path: '/changelog',
})

// Categories of change. Each gets a small gilded tag chip alongside the entry.
type Tag = 'Added' | 'Refined' | 'Fixed'

// Tag → chip class. Added gets the gold accent; Refined the muted oxblood
// (primary); Fixed a soft neutral. Colour only — never opacity/transform on
// the chip itself (we follow the documented CSS-vs-GSAP discipline even where
// no GSAP touches them).
const TAG_CLASS: Record<Tag, string> = {
  Added: 'border-gold/55 bg-gold/10 text-gold',
  Refined: 'border-primary/55 bg-primary/10 text-primary',
  Fixed: 'border-foreground/30 bg-foreground/5 text-foreground/80',
}

type Change = { tag: Tag; text: string }
type Folio = {
  version: string // e.g. "0.3"
  title: string // the folio's headline (one short phrase)
  date: string // human-readable date stamp
  changes: Change[]
}

// Reverse-chronological. Newest entry at the top.
const FOLIOS: Folio[] = [
  {
    version: '0.3',
    title: 'The Hall of Patrons opens',
    date: '20 May 2026',
    changes: [
      {
        tag: 'Added',
        text: 'The Hall of Patrons — an illuminated honour roll with ten Founding-patron slots, waiting for the first supporters.',
      },
      {
        tag: 'Added',
        text: 'A public Chronicle (this page) — every release added to the project will be logged here from now on.',
      },
      {
        tag: 'Added',
        text: 'A dedicated full match-history page (/profile/[userId]/history) — your last fifty seats at the table, with date, length, and rating delta per row. Owner-only by construction.',
      },
      {
        tag: 'Added',
        text: 'A /maintenance fallback — the "court in recess" scene the site can fall back to when the game server is unreachable. Self-contained: no network calls, so it renders when nothing else can.',
      },
      {
        tag: 'Added',
        text: 'Every Server-rendered page now redirects to /maintenance when the game server is unreachable (network failure or 5xx). The play hub probes the Worker before rendering too, so the visitor never sees the empty hub when no game can actually be created.',
      },
      {
        tag: 'Added',
        text: 'Patron storefront — the database, queries, and Worker endpoints behind the twelve patron privileges. All inert until the cosmetics ship in upcoming releases, but the data is in place: founder rank, supporter crest, gilded nickname, motto, vanity slug, card-back skin, table theme, vanity room code, living banner, victory flourish.',
      },
      {
        tag: 'Added',
        text: 'A private /admin page for the maintainer — search any user by email or nickname, grant or revoke patronage. Returns 404 to everyone else, both at the page and the API level. Used to bestow patron status until a real payment backend lands.',
      },
      {
        tag: 'Added',
        text: 'Patron cosmetics across the site — supporter crest and founding-patron mark beside the name in the navbar, leaderboard (champion, runners-up, ranked rows, search), profile, and match summary; the gilded-nickname privilege renders names in gold leaf wherever they appear; the profile shows the patron’s motto beneath the name.',
      },
      {
        tag: 'Added',
        text: 'The Hall of Patrons now reads the real list from the game server — once a name is in the Hall, it stays there even if the patronage lapses; the closing inscription updates with the count.',
      },
      {
        tag: 'Added',
        text: 'A Patronage section in Settings — read-only status (patron since, founding patron rank), and an editable form for patrons: motto, vanity slug, gilded-nickname toggle, living-banner toggle, victory-flourish toggle. Saves go through PATCH /api/me/patron with sparse-patch semantics.',
      },
      {
        tag: 'Added',
        text: 'Vanity URLs — patrons can claim a slug and share /u/<slug>, which resolves to their profile. The slug shows beneath the motto on their profile crest.',
      },
      {
        tag: 'Added',
        text: 'Vanity room codes — patrons see a "Create with <code>" button on the play hub that opens a room at their saved code, with a small "or use a random code" fallback.',
      },
      {
        tag: 'Added',
        text: 'Card-back skin and table-theme pickers in the Settings Patronage section — four designs each (Parchment / Oxblood / Forest / Ivory; Standard / Oxblood Court / Forest / Midnight) plus a "Default" tile to revert. The in-room renderer follows in a future release; the picker saves the choice today.',
      },
      {
        tag: 'Added',
        text: 'Living banner — when a patron turns it on, a gentle gold shimmer travels across their profile banner on a slow loop. Pure CSS keyframe, honours prefers-reduced-motion.',
      },
      {
        tag: 'Added',
        text: 'Patron card-back skins live in-game — the back of every face-down card in a patron’s hand renders in their chosen skin (Parchment / Oxblood / Forest / Ivory). Choice flows from Settings → WS-token claim → seat → InfluenceCard renderer.',
      },
      {
        tag: 'Added',
        text: 'Patron table themes live in-game — the host’s chosen felt (Standard / Oxblood Court / Forest / Midnight) paints the room background and vignette for everyone seated. The theme is captured at game start; mid-match changes to the host’s preference don’t migrate.',
      },
      {
        tag: 'Added',
        text: 'Patron victory flourish — when a patron with the privilege wins a match, a second, denser gold burst fires across the over-panel a beat after the standard flourish. Reduced-motion visitors get the static heading either way.',
      },
      {
        tag: 'Added',
        text: 'Custom profile banner — patrons can upload their own image to replace the preset banner colour. The picker resizes to 1200×240 WebP client-side, the Worker stores it in R2 under banners/<userId>, and the profile crest renders it via object-cover. Cleared on revoke or account deletion, R2 and DB both.',
      },
      {
        tag: 'Refined',
        text: 'The site now uses a slim gold scrollbar in place of the default browser one.',
      },
      {
        tag: 'Refined',
        text: 'The top bar now compacts almost immediately on scroll, so it no longer covers the page header on shallow pages.',
      },
      {
        tag: 'Refined',
        text: 'The Hall’s scroll fits the viewport — the honour-roll list scrolls inside itself rather than pushing the page below the fold.',
      },
    ],
  },
  {
    version: '0.2',
    title: 'The public site takes shape',
    date: '14 May 2026',
    changes: [
      {
        tag: 'Added',
        text: 'About, Support, Privacy, and Terms pages — the four pillars of the public site, each with the manuscript treatment.',
      },
      {
        tag: 'Added',
        text: 'A Support gallery walking through the twelve patronage privileges, with a Share-the-game CTA.',
      },
      {
        tag: 'Added',
        text: 'A custom 404 leaf — the "page not found" parchment with its own entrance animation.',
      },
      {
        tag: 'Refined',
        text: 'The footer carries every legal and about link in one quiet rule.',
      },
    ],
  },
  {
    version: '0.1',
    title: 'First public preview',
    date: '6 May 2026',
    changes: [
      {
        tag: 'Added',
        text: 'The play hub, profile, settings, leaderboard, and the live game room — the spine of the application.',
      },
      {
        tag: 'Added',
        text: 'Sign-in by Google, Discord, or magic-link email through Better Auth.',
      },
      {
        tag: 'Added',
        text: 'TrueSkill rating, the leaderboard, profile cards, and a post-match summary. Ranked matchmaking arrives in v2; private rooms are the v1 lobby.',
      },
      {
        tag: 'Added',
        text: 'Account deletion that anonymises in place — your matches stay on the table, your identity does not.',
      },
    ],
  },
]

// A single folio card — a parchment leaf with a date stamp, version pill, the
// folio’s headline, and a list of categorised changes.
function FolioCard({ folio }: { folio: Folio }) {
  return (
    <RevealSection className="relative">
      <article className="relative flex flex-col gap-5 border border-gold/30 bg-card/80 px-6 py-6 shadow-sm sm:px-8 sm:py-8">
        {/* Inner gilt rule — frames the leaf. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-2 border border-gold/15"
        />

        {/* Header — version pill on the left, date stamp on the right. */}
        <header className="relative flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-xs tracking-[0.2em] text-gold uppercase tabular-nums">
              v{folio.version}
            </span>
            <span
              aria-hidden
              className="block size-1 rotate-45 bg-gold/55"
            />
            <h2 className="font-display text-xl tracking-wide text-foreground sm:text-2xl">
              {folio.title}
            </h2>
          </div>
          <time className="text-xs tracking-[0.18em] text-muted-foreground uppercase tabular-nums">
            {folio.date}
          </time>
        </header>

        <OrnamentDivider className="w-24 text-gold/40" />

        {/* The changes list. */}
        <ul className="relative flex flex-col gap-3">
          {folio.changes.map((c, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 inline-flex shrink-0 items-center justify-center rounded-sm border px-2 py-0.5 font-display text-[10px] tracking-[0.18em] uppercase tabular-nums',
                  TAG_CLASS[c.tag],
                )}
              >
                {c.tag}
              </span>
              <p className="text-base leading-relaxed text-muted-foreground">
                {c.text}
              </p>
            </li>
          ))}
        </ul>
      </article>
    </RevealSection>
  )
}

export default function ChangelogPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-20 sm:pt-24">
      {/* Header. */}
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          The Chronicle
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Changelog
        </h1>
        <OrnamentDivider className="w-48 max-w-[70%] text-gold/60" />
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Every release added to Coup Online is logged here — newest folio
          first.
        </p>
      </header>

      {/* The chronicle. */}
      <div className="mt-14 flex flex-col gap-10">
        {FOLIOS.map((f) => (
          <FolioCard key={f.version} folio={f} />
        ))}
      </div>

      {/* Closing — point readers at /about for the bigger picture. */}
      <p className="mt-14 text-center text-sm text-muted-foreground">
        For the story behind the project, see{' '}
        <a
          href="/about"
          className="text-foreground underline-offset-4 transition-colors hover:text-gold hover:underline"
        >
          About
        </a>
        .
      </p>
    </main>
  )
}
