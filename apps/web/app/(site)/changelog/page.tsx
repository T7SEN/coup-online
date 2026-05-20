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

export const metadata: Metadata = { title: 'Changelog — Coup Online' }

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
        text: 'TrueSkill-based ranked matchmaking with a leaderboard, profile cards, and a post-match summary.',
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
