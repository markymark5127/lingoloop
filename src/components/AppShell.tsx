"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BookOpen, ChartNoAxesColumn, CirclePlay, Gamepad2, LayoutGrid, MessageCircle, Plus, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useT, writeLocaleCookie } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/core";
import { TARGET_INFO, type TargetLang } from "@/lib/lang";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/home", label: "Dashboard", icon: LayoutGrid },
  { href: "/videos", label: "Watch", icon: CirclePlay },
  { href: "/stories", label: "Stories", icon: BookOpen },
  { href: "/games", label: "Play", icon: Gamepad2 },
  { href: "/talk", label: "Speak", icon: MessageCircle },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
];

const LEVEL_NAME: Record<string, string> = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-intermediate", C1: "Advanced", C2: "Proficient" };

export function AppShell({ level, name, aiMode, locale, target, children }: { level: string; name: string; aiMode: "openai" | "offline"; locale: Locale; target: TargetLang; children: ReactNode }) {
  const path = usePathname();
  const t = useT();
  // Keep the cookie (used by pages outside the app shell) and <html lang> in sync with the profile.
  useEffect(() => {
    if (document.documentElement.lang !== locale || !document.cookie.includes(`ll_locale=${locale}`)) writeLocaleCookie(locale);
  }, [locale]);
  const immersive = path === "/videos";
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop: floating glass sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 p-4 md:block">
        <div className="glass flex h-full flex-col rounded-[32px] p-4">
          <Brand />
          <nav aria-label={t("Main")} className="mt-8 flex flex-col gap-1.5">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-12 items-center gap-3.5 rounded-2xl px-4 text-[15px] font-semibold transition ${
                    active ? "glass-strong text-accent" : "text-text/80 hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  <Icon className={`h-[22px] w-[22px] transition ${active ? "text-accent" : "text-text/70 group-hover:text-text"}`} strokeWidth={1.9} aria-hidden />
                  {t(label)}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            {aiMode === "offline" && (
              <p className="rounded-2xl bg-surface-2 px-3 py-2 text-[11px] leading-snug text-muted">{t("Offline content engine. Add OPENAI_API_KEY for live AI, chat & voice.")}</p>
            )}
            <div className="flex items-center justify-between px-2 text-sm font-medium text-muted">
              {t("Appearance")}
              <ThemeToggle />
            </div>
            <div className="glass-strong flex items-center gap-3 rounded-[22px] p-3">
              <Link href="/settings" className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold">{name || t("Your profile")}</span>
                  <span className="block truncate text-xs text-muted">
                    {t(LEVEL_NAME[level] ?? level)} · {TARGET_INFO[target].flag} {t(TARGET_INFO[target].name)}
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: glass top bar */}
        {!immersive && (
          <header className="sticky top-0 z-30 px-3 pt-3 md:hidden">
            <div className="glass flex items-center justify-between rounded-[22px] px-3 py-2">
              <Brand compact />
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <Link href="/settings" aria-label={t("Profile and settings")}>
                  <Avatar name={name} small />
                </Link>
              </div>
            </div>
          </header>
        )}
        <main className={`flex-1 ${immersive ? "" : "pb-28 md:pb-8"}`}>{children}</main>
      </div>

      {/* Mobile: floating glass tab bar */}
      <nav
        aria-label={t("Main")}
        className="fixed inset-x-3 bottom-3 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className={`flex rounded-[26px] p-1.5 ${immersive ? "border border-white/15 bg-black/45 text-white backdrop-blur-2xl" : "glass-strong"}`}>
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10px] font-semibold transition ${
                  active ? (immersive ? "bg-white/20 text-white" : "bg-accent-soft text-accent") : immersive ? "text-white/65" : "text-muted"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span className="max-w-full truncate px-0.5">{t(label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/home" className="flex items-center gap-3 px-1">
      <span className={`grid place-items-center rounded-2xl bg-accent-gradient text-white shadow-lg shadow-accent/30 ${compact ? "h-9 w-9" : "h-12 w-12"}`}>
        <Plus className={compact ? "h-5 w-5" : "h-7 w-7"} strokeWidth={2.6} aria-hidden />
      </span>
      <span className={`font-display font-extrabold ${compact ? "text-lg" : "text-[26px]"}`}>LingoLoop</span>
    </Link>
  );
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#e9e2ff] to-[#d6c8ff] font-display font-bold text-accent dark:from-[#3b2f7a] dark:to-[#2a2160] ${small ? "h-9 w-9 text-sm" : "h-11 w-11 text-lg"}`}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}
