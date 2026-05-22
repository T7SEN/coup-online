import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { OrnamentDivider } from '@/components/site/ornament-divider'

// Terms of Service. Static Server Component — content renders into the HTML;
// the scroll-reveal wrapper is a dynamically-loaded client island (the same
// pattern as the Rules and Privacy pages).
//
// Plain-language terms for a free, ranked hobby game: acceptable use, fair
// play, content, suspension, the usual disclaimers. Keep in sync with what the
// app does (Better Auth accounts, self-service deletion in Settings, the
// unofficial-adaptation status).
const RevealSection = dynamic(() =>
  import('@/components/site/reveal-section').then((m) => m.RevealSection),
)

import { pageMetadata } from '@/lib/site-metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Terms',
  description:
    'Terms of use for Coup Online — fair play, account responsibilities, prohibited behaviour, and account anonymisation on deletion.',
  path: '/terms',
})

// Bump whenever the terms change.
const UPDATED = '19 May 2026'

// One section — a Cinzel heading, an ornamental rule, content; revealed on
// scroll.
function Section({
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

// A list entry — a gold lozenge bullet, a lead-in term, then the detail.
function Item({
  term,
  children,
}: {
  term: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-gold/70"
      />
      <p className="text-base leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{term}</span> —{' '}
        {children}
      </p>
    </li>
  )
}

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-20 sm:pt-24">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Terms
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Terms of Service
        </h1>
        <OrnamentDivider className="w-48 max-w-[70%] text-gold/60" />
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          The rules of the table — what you agree to by playing Coup Online.
        </p>
        <p className="text-sm text-muted-foreground">
          Last updated {UPDATED}
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-12">
        <Section title="Agreement to these terms">
          <p className="text-lg leading-relaxed">
            These Terms of Service govern your use of Coup Online — the
            website, the game, and everything connected to them (the{' '}
            &ldquo;Service&rdquo;). By creating an account or playing, you
            accept these terms in full. If you do not agree with them, please
            do not use the Service. Coup Online is free to play, and these
            terms apply to everyone who uses it.
          </p>
        </Section>

        <Section title="Who may play">
          <p className="text-lg leading-relaxed">
            You must be at least 13 years old to use Coup Online. If the law
            where you live sets a higher minimum age for holding an online
            account or for agreeing to terms such as these, you must meet that
            higher age instead. By using the Service you confirm that you meet
            this requirement and that nothing prevents you from agreeing to
            these terms. The Service is intended for personal, non-commercial
            enjoyment.
          </p>
        </Section>

        <Section title="Your account">
          <p className="text-lg leading-relaxed">
            You sign in through a provider — Google, Discord, or an email link
            — and Coup Online keeps a profile tied to that identity. You are
            responsible for everything that happens under your account and for
            keeping access to your sign-in method secure. Provide accurate
            information, keep to one account per person, and do not share your
            account or sign in on behalf of someone else. If you believe your
            account has been accessed without your permission, stop using it
            and secure your sign-in provider straight away. You may delete your
            account at any time from Settings.
          </p>
        </Section>

        <Section title="Fair play">
          <p className="text-lg leading-relaxed">
            Coup Online is a ranked, competitive game, and a match is only
            worth playing if everyone plays it honestly. The game server holds
            the only authoritative state of a match; attempting to bypass,
            predict, or tamper with it is a serious breach of these terms. The
            following are <strong>not allowed</strong>:
          </p>
          <ul className="flex flex-col gap-3">
            <Item term="Cheating">
              using any tool, modified client, or technique that reveals
              hidden information or grants an unfair advantage.
            </Item>
            <Item term="Automation">
              using bots, scripts, or automated input to play matches, farm
              rating, or access the Service.
            </Item>
            <Item term="Collusion">
              coordinating secretly with other players to fix the outcome of a
              match, or teaming against others in a free-for-all game.
            </Item>
            <Item term="Multiple accounts">
              creating additional accounts to inflate a record, evade a
              suspension, manipulate matchmaking, or play against yourself.
            </Item>
            <Item term="Rating manipulation">
              deliberately losing, throwing matches, win-trading, or otherwise
              distorting the leaderboard or skill ratings.
            </Item>
            <Item term="Disruption">
              deliberately disconnecting, stalling, or abandoning matches to
              deny other players a fair game.
            </Item>
          </ul>
          <p className="text-lg leading-relaxed">
            Skill ratings, match records, and leaderboard standings are awarded
            at the maintainer&rsquo;s discretion and may be corrected or reset
            where fair play has been broken.
          </p>
        </Section>

        <Section title="Conduct and community">
          <p className="text-lg leading-relaxed">
            Coup Online is shared by players of every background. Treat the
            people across the table with basic respect. Whatever you type,
            choose as a nickname, or upload, the following are{' '}
            <strong>not allowed</strong>:
          </p>
          <ul className="flex flex-col gap-3">
            <Item term="Harassment">
              threatening, bullying, stalking, or targeting another person.
            </Item>
            <Item term="Hateful content">
              slurs or attacks based on race, ethnicity, nationality, religion,
              gender, sexuality, disability, or any similar characteristic.
            </Item>
            <Item term="Impersonation">
              pretending to be another person, the maintainer, or an official
              of the project.
            </Item>
            <Item term="Spam and disruption">
              flooding chat, advertising, or otherwise interfering with
              others&rsquo; enjoyment of the game.
            </Item>
            <Item term="Unlawful or harmful use">
              using the Service to break the law, to infringe anyone&rsquo;s
              rights, or to distribute malware or harmful material.
            </Item>
          </ul>
          <p className="text-lg leading-relaxed">
            Nicknames are checked against a basic filter, but that filter is
            not a judgement that any given name is acceptable — these conduct
            rules still apply in full.
          </p>
        </Section>

        <Section title="Content you provide">
          <p className="text-lg leading-relaxed">
            You may set a nickname and an avatar, and send messages within a
            room. You keep ownership of what you create. By providing it,
            though, you grant Coup Online a non-exclusive, worldwide,
            royalty-free licence to store, display, and transmit that content
            for the sole purpose of operating the Service — for example,
            showing your nickname on the leaderboard or your avatar in a match.
            You are responsible for the content you provide, and you confirm
            that you have the right to use it and that it does not break these
            terms. The maintainer may remove or change any content — including
            a nickname or avatar — that breaches these terms or is reported,
            without prior notice.
          </p>
        </Section>

        <Section title="The game and its availability">
          <p className="text-lg leading-relaxed">
            Coup Online is offered free of charge and is under active
            development. Features, rules, the visual design, characters, skill
            ratings, and leaderboards may be added, changed, reset, or removed
            at any time. The Service is provided on an{' '}
            &ldquo;as available&rdquo; basis: it may be unavailable,
            interrupted, or discontinued — in whole or in part — without
            notice. Matches in progress may be affected by maintenance, faults,
            or outages. No particular feature, level of performance, or
            continued availability is promised.
          </p>
        </Section>

        <Section title="Suspension and termination">
          <p className="text-lg leading-relaxed">
            The maintainer may suspend, restrict, or end your access to the
            Service — and may remove associated data such as ratings or records
            — if you breach these terms, if your conduct harms other players or
            the Service, or where reasonably necessary to protect the project
            or comply with the law. Where it is practical and appropriate, a
            warning may be given first, but this is not guaranteed. You may
            stop using the Service and delete your account at any time from
            Settings. Sections of these terms that by their nature should
            survive — including intellectual property, disclaimers, and the
            limitation of liability — continue to apply after your account
            ends.
          </p>
        </Section>

        <Section title="Intellectual property">
          <p className="text-lg leading-relaxed">
            Coup Online is an unofficial, fan-made adaptation of Coup, the card
            game designed by Rikki Tahta. All rights in the original game
            belong to its creator and rights holders; Coup Online is not
            affiliated with, sponsored by, or endorsed by them. The Coup Online
            software, its visual design, text, and original artwork are the
            work of the project&rsquo;s maintainer. Nothing in these terms
            gives you ownership of — or the right to copy, sell, or
            commercially exploit — the Service or the original game. You may,
            of course, play the game and share links to it.
          </p>
        </Section>

        <Section title="No warranty">
          <p className="text-lg leading-relaxed">
            The Service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
            <strong>&ldquo;as available&rdquo;</strong>, without warranties of
            any kind, whether express or implied, to the fullest extent
            permitted by law. Coup Online does not warrant that the Service
            will be uninterrupted, timely, secure, error-free, or free of bugs,
            or that any defect will be corrected. You use the Service at your
            own discretion and risk.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p className="text-lg leading-relaxed">
            To the fullest extent permitted by law, the maintainer of Coup
            Online will not be liable for any indirect, incidental, special, or
            consequential loss, nor for any loss of data, ratings, progress, or
            goodwill, arising out of or relating to your use of — or inability
            to use — the Service. Coup Online is provided free of charge.
            Nothing in these terms limits any liability that cannot be limited
            under applicable law.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p className="text-lg leading-relaxed">
            These terms may be updated as the game grows or as the law
            requires. When they change, the date above is updated, and
            significant changes may be highlighted in the game where practical.
            By continuing to use the Service after a change takes effect, you
            accept the revised terms; if you do not accept them, you should
            stop using the Service, and you may delete your account.
          </p>
        </Section>

        <Section title="General">
          <p className="text-lg leading-relaxed">
            If any part of these terms is found to be unenforceable, the rest
            remains in force. A failure to enforce a term is not a waiver of
            it. These terms, together with the Privacy Notice, form the entire
            agreement between you and Coup Online regarding the Service. If you
            have a question about these terms, please get in touch with me at{' '}
            <strong>contact@t7sen.com</strong>.
          </p>
        </Section>
      </div>
    </main>
  )
}
