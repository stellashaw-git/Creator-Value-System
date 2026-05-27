import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorthyIQ — Creator Intelligence Platform",
  description:
    "WorthyIQ helps brands and MCN agencies evaluate creators, improve influencer marketing ROI, and turn creator signals into actionable campaign decisions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[var(--bg)] text-[var(--ink)] antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
