import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Online Board Games",
  description:
    "チェス・将棋・トランプをCPU/オンラインで遊べる対戦プラットフォーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
