import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Founder — supervise your AI coding agents from anywhere",
  description:
    "Supervise your AI coding agents from anywhere — and watch the world's token spend in real time. Open-source, self-hosted dev supervision.",
  openGraph: {
    title: "Founder",
    description:
      "Supervise your AI coding agents from anywhere — and watch the world's token spend in real time.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1014",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
