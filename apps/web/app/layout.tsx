import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coup Online",
  description: "Real-time competitive Coup — 3-6 players, server-authoritative.",
};

// SessionProvider is gone — Better Auth's React client (lib/auth-client.ts)
// manages its own internal state and does not require a provider.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
