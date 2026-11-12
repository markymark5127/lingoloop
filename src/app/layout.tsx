import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Plus_Jakarta_Sans } from "next/font/google";
import { themeScript } from "@/components/ThemeToggle";
import { ServiceWorker } from "@/components/ServiceWorker";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/core";
import "./globals.css";

const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["700", "800"] });
// Japanese glyph fallback (Plus Jakarta Sans has no CJK). Not preloaded: only fetched when JP text renders.
const jp = Noto_Sans_JP({ variable: "--font-jp", subsets: ["latin"], weight: ["400", "500", "700", "800"], preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: translate(locale, "LingoLoop — learn Spanish & Japanese through stories, videos & conversation"),
    description: translate(locale, "An AI-powered language immersion platform. Watch, read, play and talk — one adaptive engine personalizes everything."),
    applicationName: "LingoLoop",
    appleWebApp: { capable: true, title: "LingoLoop", statusBarStyle: "default" },
    formatDetection: { telephone: false },
    icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a1a" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={`${body.variable} ${display.variable} ${jp.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
