import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { OrnamentDivider } from "@/components/site/ornament-divider";

// Privacy notice. Static Server Component — the content renders straight into
// the HTML; the one piece of client behaviour, the scroll-reveal wrapper, is a
// dynamically-loaded island (the same pattern as the Rules page).
//
// Keep this in sync with what the app actually does: Better Auth accounts
// (apps/game-server), D1 + R2 storage, the Sentry config (sendDefaultPii is
// false — § 5), and Cloudflare Web Analytics (cookie-free).
const RevealSection = dynamic(() =>
  import("@/components/site/reveal-section").then((m) => m.RevealSection),
);

import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description:
    "What Coup Online stores, why, and how long. We keep the minimum — no analytics on personal data, no ads, no third-party trackers.",
  path: "/privacy",
});

// Bump whenever the notice changes.
const UPDATED = "19 May 2026";

// One section — a Cinzel heading, an ornamental rule, content; revealed on
// scroll.
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
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
  );
}

// A list entry — a gold lozenge bullet, a lead-in term, then the detail.
function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-gold/70"
      />
      <p className="text-base leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{term}</span> — {children}
      </p>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-20 pb-20 sm:pt-24">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-medium tracking-[0.25em] text-muted-foreground uppercase">
          Privacy
        </p>
        <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
          Privacy Notice
        </h1>
        <OrnamentDivider className="w-48 max-w-[70%] text-gold/60" />
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          What Coup Online collects, why, and the control you keep over it.
        </p>
        <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>
      </header>

      <div className="mt-14 flex flex-col gap-12">
        <Section title="In short">
          <p className="text-lg leading-relaxed">
            Coup Online gathers only what it needs to run your account and the
            game. There are <strong>no ads</strong>, no third-party trackers,
            and your data is <strong>never sold</strong>. This notice sets out,
            in plain terms, what is collected and what you can do about it.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="flex flex-col gap-3">
            <Item term="Account">
              when you sign in with Google, Discord, or an email link, the game
              receives your name and email address — and, with Google or
              Discord, the avatar from that account.
            </Item>
            <Item term="Profile">
              a nickname, an avatar, and a crest banner colour, if you choose to
              set them.
            </Item>
            <Item term="Gameplay">
              a record of the matches you play — results, finishing positions,
              and your skill rating over time.
            </Item>
            <Item term="Technical">
              a cookie that keeps you signed in, and — stored with each sign-in
              session — your IP address and browser type, used to keep your
              account secure.
            </Item>
          </ul>
        </Section>

        <Section title="How we use it">
          <p className="text-lg leading-relaxed">
            Your data is used only to run your account and sign you in; to play
            matches and maintain the leaderboard, your profile and your match
            history; and to keep the game secure and fair. It is{" "}
            <strong>never used for advertising or profiling</strong>.
          </p>
        </Section>

        <Section title="What other players see">
          <p className="text-lg leading-relaxed">
            Your nickname, avatar, skill rating and leaderboard standing are{" "}
            <strong>public</strong> — other players can see them. Your email
            address is <strong>never</strong> shown to anyone. The detail of a
            match is visible only to the players who took part in it.
          </p>
        </Section>

        <Section title="Who else handles your data">
          <p className="text-lg leading-relaxed">
            Coup Online relies on a small set of trusted services to operate.
            Each receives only what it needs:
          </p>
          <ul className="flex flex-col gap-3">
            <Item term="Google and Discord">
              sign-in, when you choose to use them.
            </Item>
            <Item term="Resend">delivers the email sign-in links.</Item>
            <Item term="Cloudflare">
              runs the game server and stores the database and avatars; its Web
              Analytics gives cookie-free, aggregate visit counts.
            </Item>
            <Item term="Vercel">hosts the website.</Item>
            <Item term="Sentry">
              error monitoring, configured so it does not receive your IP
              address or personal details.
            </Item>
          </ul>
        </Section>

        <Section title="Cookies">
          <p className="text-lg leading-relaxed">
            Coup Online uses a single, essential cookie — the one that keeps you
            signed in. There are{" "}
            <strong>no advertising or tracking cookies</strong>, and the visit
            analytics are entirely cookie-free.
          </p>
        </Section>

        <Section title="Keeping and deleting your data">
          <p className="text-lg leading-relaxed">
            Your data is kept for as long as your account exists. You can{" "}
            <strong>delete your account at any time</strong> from Settings.
            Deletion erases your name, email and avatar. Past match records are
            kept but anonymised — shown as &ldquo;Deleted player&rdquo; — so the
            leaderboard and other players&rsquo; match histories stay intact.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p className="text-lg leading-relaxed">
            This notice may be updated as the game grows; the date above always
            reflects the current version. Coup Online is not directed at
            children under 13. If you have a question about your data or this
            notice, please get in touch with me at <strong>contact@t7sen.com</strong>.
          </p>
        </Section>
      </div>
    </main>
  );
}
