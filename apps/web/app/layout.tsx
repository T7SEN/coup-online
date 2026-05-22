import type { Metadata, Viewport } from "next";
import { Cinzel, EB_Garamond } from "next/font/google";
import Script from "next/script";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE } from "@/lib/site-metadata";
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

// Site-wide metadata. The title template means child pages set just their
// leaf title (e.g. `title: 'Settings'`) and the suffix is added automatically
// — see lib/site-metadata.ts::pageMetadata. metadataBase makes every
// relative URL in metadata resolve to the production origin so canonicals,
// OG, Twitter all serialize correctly even at build time.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.name,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: "T7SEN", url: SITE.url }],
  creator: "T7SEN",
  publisher: "T7SEN",
  keywords: [
    "Coup",
    "Coup card game",
    "multiplayer",
    "online card game",
    "bluff",
    "social deduction",
    "real-time",
    "free",
    "no ads",
    "browser game",
  ],
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.name,
    description: SITE.description,
    // Default OG image — generated dynamically by app/opengraph-image.tsx.
    // Per-page metadata can override with its own image.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Icon routes (app/icon.tsx, app/apple-icon.tsx) handle these; Next.js
  // wires them into the metadata automatically when those files exist,
  // but we list them explicitly so they're discoverable.
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  // Standalone "add to home screen" hint on iOS — does NOT make us a PWA
  // (no service worker, no offline support — SKILL.md § 3.7). Just sets
  // the iOS bookmark behavior and shortname.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE.shortName,
  },
};

// viewport / themeColor moved out of `metadata` in Next 13.5+. Setting
// initial-scale=1 is mandatory for proper mobile rendering. maximumScale=5
// caps zoom rather than blocking accessibility-required pinch-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: SITE.themeColor,
  colorScheme: "light",
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
