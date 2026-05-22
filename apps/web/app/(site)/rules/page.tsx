/* eslint-disable @next/next/no-img-element -- the character card SVGs are
   local, trusted assets in public/cards; next/image SVG handling needs the
   global dangerouslyAllowSVG flag, which we don't want to enable. */

import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Coins } from 'lucide-react'
import { OrnamentDivider } from '@/components/site/ornament-divider'

// The full base-game rules. Static Server Component — content renders into the
// HTML for speed + SEO; the one piece of client behaviour, the scroll-reveal
// wrapper, is a dynamically-loaded island (Next.js code-splits it). Rules
// content is the canonical SKILL.md § 4 ruleset.
const RevealSection = dynamic(() =>
  import('@/components/site/reveal-section').then((m) => m.RevealSection),
)

import { pageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Rules',
  description:
    'The complete Coup rule set as we enforce it — 15-card deck, the seven actions, blocks, challenges, influence loss, mandatory Coup at 10 coins, win condition.',
  path: '/rules',
})

// Shared hover treatment for the page's boxes + cards — a small lift, a
// warmed border, and a shadow. Snaps (no transition) under reduced motion.
const HOVER =
  'transition duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-md'

// Setup facts, at a glance. SKILL.md § 4.1, § 4.2.
const SETUP_STATS = [
  { value: '3–6', label: 'Players' },
  { value: '15', label: 'Cards in deck' },
  { value: '2', label: 'Influence each' },
  { value: '2', label: 'Coins each' },
]

// The seven actions. SKILL.md § 4.3 (general) + § 4.4 (character). `char` is
// the character whose claim the action rests on (null = open to anyone).
// SKILL.md § 4.6 — only character claims can be challenged.
const GENERAL_ACTIONS = [
  {
    name: 'Income',
    char: null,
    cost: '+1',
    effect: 'Take a single coin from the treasury.',
    challenge: 'Cannot be challenged',
    block: 'Cannot be blocked',
  },
  {
    name: 'Foreign Aid',
    char: null,
    cost: '+2',
    effect: 'Take two coins from the treasury.',
    challenge: 'Cannot be challenged',
    block: 'Blocked by the Duke',
  },
  {
    name: 'Coup',
    char: null,
    cost: '−7',
    effect:
      'Pay seven coins and strike a player — they lose an influence of their choice.',
    challenge: 'Cannot be challenged',
    block: 'Unstoppable',
  },
]

const CHARACTER_ACTIONS = [
  {
    name: 'Tax',
    char: 'Duke',
    cost: '+3',
    effect: 'Take three coins from the treasury.',
    challenge: 'Can be challenged',
    block: 'Cannot be blocked',
  },
  {
    name: 'Assassinate',
    char: 'Assassin',
    cost: '−3',
    effect: 'Pay three coins and strike a player — they lose an influence.',
    challenge: 'Can be challenged',
    block: 'Blocked by the Contessa',
  },
  {
    name: 'Steal',
    char: 'Captain',
    cost: '+2',
    effect:
      'Take two coins from a chosen rival — or all they have, if they hold fewer.',
    challenge: 'Can be challenged',
    block: 'Blocked by a Captain or Ambassador',
  },
  {
    name: 'Exchange',
    char: 'Ambassador',
    cost: null,
    effect:
      'Draw two cards from the Court Deck, keep the cards you want, and return the rest.',
    challenge: 'Can be challenged',
    block: 'Cannot be blocked',
  },
]

// The five characters. SKILL.md § 4.1, § 4.4, § 4.5.
const CHARACTERS = [
  {
    name: 'Duke',
    art: '/cards/duke.svg',
    action: 'Tax — take 3 coins.',
    blocks: 'Blocks Foreign Aid.',
  },
  {
    name: 'Assassin',
    art: '/cards/assassin.svg',
    action: 'Assassinate — a rival loses an influence.',
    blocks: 'Blocks nothing.',
  },
  {
    name: 'Captain',
    art: '/cards/captain.svg',
    action: 'Steal — take 2 coins from a rival.',
    blocks: 'Blocks stealing.',
  },
  {
    name: 'Ambassador',
    art: '/cards/ambassador.svg',
    action: 'Exchange — swap with the Court Deck.',
    blocks: 'Blocks stealing.',
  },
  {
    name: 'Contessa',
    art: '/cards/contessa.svg',
    action: 'No action of its own.',
    blocks: 'Blocks assassination.',
  },
]

// Counteractions — which character claim stops which action. SKILL.md § 4.5.
const BLOCKS = [
  { arts: ['/cards/duke.svg'], text: 'The Duke blocks Foreign Aid.' },
  {
    arts: ['/cards/contessa.svg'],
    text: 'The Contessa blocks an Assassination.',
  },
  {
    arts: ['/cards/captain.svg', '/cards/ambassador.svg'],
    text: 'A Captain or an Ambassador blocks a Steal.',
  },
]

// A small pill — challenge / block status on an action.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  )
}

// One action — a card-art (or coin) thumbnail, the effect, and status chips.
function ActionCard({
  name,
  char,
  cost,
  effect,
  challenge,
  block,
}: {
  name: string
  char: string | null
  cost: string | null
  effect: string
  challenge: string
  block: string
}) {
  return (
    <div
      className={`flex items-start gap-4 rounded-md border border-gold/25 bg-card/50 p-4 ${HOVER}`}
    >
      {char ? (
        <img
          src={`/cards/${char.toLowerCase()}.svg`}
          alt=""
          loading="lazy"
          className="aspect-2/3 w-16 shrink-0 rounded-sm border border-gold/25 bg-card object-cover shadow-sm"
        />
      ) : (
        <div className="flex aspect-2/3 w-16 shrink-0 items-center justify-center rounded-sm border border-gold/25 bg-gold/10">
          <Coins className="size-6 text-gold" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h4 className="font-display text-lg tracking-wide">{name}</h4>
          {cost && (
            <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-sm font-medium text-gold">
              {cost} {cost === '+1' ? 'coin' : 'coins'}
            </span>
          )}
        </div>
        {char && (
          <p className="text-sm tracking-wide text-gold/90">Claim the {char}</p>
        )}
        <p className="text-base leading-relaxed">{effect}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Chip>{challenge}</Chip>
          <Chip>{block}</Chip>
        </div>
      </div>
    </div>
  )
}

// One rules section — a Cinzel heading, an ornamental rule, content; revealed
// on scroll.
function RuleSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <RevealSection className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl tracking-wide sm:text-2xl">
          {title}
        </h2>
        <OrnamentDivider className="w-28 text-gold/45" />
      </div>
      {children}
    </RevealSection>
  )
}

export default function RulesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-20 sm:pt-24">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          The full rules
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          How to Play Coup
        </h1>
        <OrnamentDivider className="w-48 max-w-[70%] text-gold/60" />
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          A faithful adaptation of Coup by Rikki Tahta. Everything you need to
          scheme your way to the last seat at the table.
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-12">
        <RuleSection title="Objective">
          <p className="text-lg leading-relaxed">
            Coup is a game of bluff and deduction for three to six players.
            Each player is a scheming noble at a corrupt court, holding hidden
            cards of <strong>influence</strong>. Claim characters you may not
            hold, expose the lies of others, and be the{' '}
            <strong>last player with influence still standing</strong>.
          </p>
        </RuleSection>

        <RuleSection title="Setup">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SETUP_STATS.map((s) => (
              <div
                key={s.label}
                className={`flex flex-col items-center gap-0.5 rounded-md border border-gold/20 bg-card/50 px-3 py-4 text-center ${HOVER}`}
              >
                <span className="font-display text-2xl tracking-wide text-gold">
                  {s.value}
                </span>
                <span className="text-xs tracking-wide text-muted-foreground">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-lg leading-relaxed">
            The deck holds three copies each of the five characters. After a
            shuffle, every player is dealt two character cards kept face-down —
            their two influence — and takes two coins. The cards left over form
            the <strong>Court Deck</strong>, a face-down draw pile. A random
            player goes first; play passes clockwise.
          </p>
        </RuleSection>

        <RuleSection title="Taking your turn">
          <p className="text-lg leading-relaxed">
            On your turn you take <strong>exactly one action</strong>. Some are
            open to anyone; others rest on claiming a character — and nobody
            checks that claim unless a rival challenges it. You need not
            actually hold the character. <strong>You may bluff.</strong>
          </p>
        </RuleSection>

        <RuleSection title="The actions">
          <p className="text-lg leading-relaxed">
            Seven actions in all — three open to everyone, four built on a
            character&rsquo;s power.
          </p>
          <h3 className="mt-1 text-xs font-medium tracking-[0.2em] text-gold/80 uppercase">
            Open to anyone
          </h3>
          <div className="flex flex-col gap-3">
            {GENERAL_ACTIONS.map((a) => (
              <ActionCard key={a.name} {...a} />
            ))}
          </div>
          <h3 className="mt-3 text-xs font-medium tracking-[0.2em] text-gold/80 uppercase">
            Character actions
          </h3>
          <div className="flex flex-col gap-3">
            {CHARACTER_ACTIONS.map((a) => (
              <ActionCard key={a.name} {...a} />
            ))}
          </div>
        </RuleSection>

        <RuleSection title="The five characters">
          <p className="text-lg leading-relaxed">
            Three copies of each sit in the deck. A character grants an action,
            a counteraction, or both.
          </p>
          <ul className="mt-1 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {CHARACTERS.map((c) => (
              <li
                key={c.name}
                className={`flex flex-col gap-2 rounded-md border border-gold/20 bg-card/40 p-3 text-center ${HOVER}`}
              >
                <img
                  src={c.art}
                  alt={`${c.name} card`}
                  loading="lazy"
                  className="aspect-2/3 w-full rounded-sm border border-gold/25 bg-card object-cover shadow-sm"
                />
                <h4 className="font-display text-base tracking-wide">
                  {c.name}
                </h4>
                <div className="flex flex-col gap-1">
                  <p className="text-sm leading-relaxed">{c.action}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {c.blocks}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </RuleSection>

        <RuleSection title="Challenges">
          <p className="text-lg leading-relaxed">
            Whenever a player claims a character — for an action or a block —
            any rival may <strong>challenge</strong> it before it resolves. The
            challenged player must reveal one of their cards.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={`rounded-md border border-success/40 bg-success/10 p-4 transition duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-success/60 hover:shadow-md`}
            >
              <h4 className="font-display text-base tracking-wide text-success">
                The claim holds up
              </h4>
              <p className="mt-1.5 text-base leading-relaxed">
                The challenger loses an influence. The proven card is shuffled
                back into the Court Deck and swapped for a fresh one — so the
                character stays a secret.
              </p>
            </div>
            <div
              className={`rounded-md border border-destructive/40 bg-destructive/10 p-4 transition duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:border-destructive/60 hover:shadow-md`}
            >
              <h4 className="font-display text-base tracking-wide text-destructive">
                The bluff is caught
              </h4>
              <p className="mt-1.5 text-base leading-relaxed">
                The bluffer loses an influence and the action is cancelled. Any
                coins already paid — such as the three for an Assassination —
                are gone for good.
              </p>
            </div>
          </div>
        </RuleSection>

        <RuleSection title="Counteractions">
          <p className="text-lg leading-relaxed">
            Some actions can be stopped by a player claiming the right
            character. A block is <strong>itself a claim</strong> — so it need
            not be true, and it can be challenged in exactly the same way.
          </p>
          <ul className="flex flex-col gap-3">
            {BLOCKS.map((b) => (
              <li
                key={b.text}
                className={`flex items-center gap-3 rounded-md border border-gold/25 bg-card/50 p-3 ${HOVER}`}
              >
                <span className="flex shrink-0 gap-1.5">
                  {b.arts.map((art) => (
                    <img
                      key={art}
                      src={art}
                      alt=""
                      loading="lazy"
                      className="aspect-2/3 w-11 rounded-sm border border-gold/25 bg-card object-cover shadow-sm"
                    />
                  ))}
                </span>
                <p className="text-base leading-relaxed">{b.text}</p>
              </li>
            ))}
          </ul>
        </RuleSection>

        <RuleSection title="Losing influence">
          <p className="text-lg leading-relaxed">
            When you lose an influence, <strong>you choose</strong> which of
            your cards to reveal. It is turned face-up for all to see and is
            out of play. When both of your cards lie face-up, you are out of
            the game.
          </p>
        </RuleSection>

        <RuleSection title="The ten-coin rule">
          <div
            className={`flex gap-3 rounded-md border border-gold/40 bg-gold/10 p-4 ${HOVER}`}
          >
            <Coins className="size-6 shrink-0 text-gold" />
            <p className="text-base leading-relaxed">
              Coins are power, but they are also a clock. If you{' '}
              <strong>begin your turn with 10 or more coins</strong>, you must
              launch a Coup that turn — no other action is allowed.
            </p>
          </div>
        </RuleSection>

        <RuleSection title="Winning">
          <p className="text-lg leading-relaxed">
            Players are knocked out as they lose their second influence. The{' '}
            <strong>last player with a card still hidden</strong> wins the
            court.
          </p>
        </RuleSection>
      </div>
    </main>
  )
}
