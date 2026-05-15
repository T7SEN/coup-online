import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

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
    <html lang="en">
      <body>
        {children}
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
