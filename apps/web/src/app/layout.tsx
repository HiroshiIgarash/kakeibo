import type { Metadata } from "next";
import { DM_Mono, Noto_Sans_JP } from "next/font/google";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import { cn } from "@/lib/utils";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "かけいぼ",
  description: "個人用家計簿アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={cn("dark h-full antialiased", notoSansJP.variable, dmMono.variable)}>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          {children}
          {/* BottomNav（固定）の高さ分のスペーサー */}
          <div aria-hidden style={{ height: "calc(56px + env(safe-area-inset-bottom))" }} />
          <AppShell />
        </Providers>
      </body>
    </html>
  );
}
