import type { Metadata } from "next";
import { Cinzel, EB_Garamond } from "next/font/google";
import Script from "next/script";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Renaissance-court typography (references/design-system.md):
//   Cinzel      — Roman inscriptional capitals, used for display headings.
//   EB Garamond — a classic Renaissance serif, used for body + UI text.
// Both are variable fonts; next/font self-hosts them and exposes a CSS
// variable that globals.css maps to --font-display / --font-sans.
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coup Online",
  description: "Real-time competitive Coup — 3-6 players, server-authoritative.",
};

// Cloudflare Web Analytics (SKILL.md § 2 — free, no event cap, no Vercel
// Analytics). The beacon only renders when the token env var is set, so local
// dev and un-configured deploys stay clean. NEXT_PUBLIC_ is inlined at build
// time; the token is not a secret.
const cfAnalyticsToken = process.env.NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN;

// SessionProvider is gone — Better Auth's React client (lib/auth-client.ts)
// manages its own internal state and does not require a provider.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${ebGaramond.variable}`}
    >
      <body className="antialiased">
        {/* The app is a min-h-svh flex column — page content grows, the global
            Footer pins to the bottom. The Navbar is added by (site)/layout.tsx
            for site pages only; the game room stays chrome-free. TooltipProvider
            gives Radix tooltip context app-wide; Toaster hosts sonner errors. */}
        <TooltipProvider>
          <div data-app-shell className="flex min-h-svh flex-col">
            <div className="flex flex-1 flex-col">{children}</div>
            <Footer />
          </div>
        </TooltipProvider>
        <Toaster />
        {cfAnalyticsToken && (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: cfAnalyticsToken })}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
