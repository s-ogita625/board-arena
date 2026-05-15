import type { Metadata, Viewport } from "next";
import { Rajdhani, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});
const sansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BoardArena | Online Board Games",
  description:
    "チェス・将棋・トランプをCPU/オンラインで遊べる対戦プラットフォーム",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0d12",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={`${display.variable} ${sansJp.variable} ${mono.variable}`}
    >
      <body className="min-h-screen flex flex-col bg-arena-bg text-arena-text">
        {children}
      </body>
    </html>
  );
}
