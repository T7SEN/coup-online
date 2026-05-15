import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coup Online",
  description: "Real-time competitive Coup — 3-6 players, server-authoritative.",
};

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
