import Link from "next/link";
import { version } from "../package.json";

// Global footer — rendered on every page by the root layout, the game room
// included (v1 spec). One thin court rule; the line wraps on narrow screens.
// Server Component, no interactivity. references/design-system.md.
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gold/30">
      <p className="mx-auto max-w-5xl px-4 py-2.5 text-center text-xs text-muted-foreground">
        Made With{" "}
        <span role="img" aria-label="love">
          💜
        </span>{" "}
        by T7SEN
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        <Link
          href="/about"
          className="transition-colors hover:text-foreground"
        >
          About
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        <Link
          href="/support"
          className="transition-colors hover:text-foreground"
        >
          Support
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        <Link
          href="/patrons"
          className="transition-colors hover:text-foreground"
        >
          Patrons
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        <Link
          href="/privacy"
          className="transition-colors hover:text-foreground"
        >
          Privacy
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        <Link
          href="/terms"
          className="transition-colors hover:text-foreground"
        >
          Terms
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        <Link
          href="/changelog"
          aria-label={`Changelog — currently on v${version}`}
          className="tabular-nums transition-colors hover:text-foreground"
        >
          v{version}
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
          ·
        </span>
        © {year}
      </p>
    </footer>
  );
}
