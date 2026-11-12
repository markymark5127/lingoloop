"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { href: "/videos", label: "Videos", icon: "🎬" },
  { href: "/stories", label: "Stories", icon: "📖" },
  { href: "/games", label: "Games", icon: "🎮" },
  { href: "/talk", label: "Talk", icon: "💬" },
  { href: "/progress", label: "Progress", icon: "📈" },
];

export function AppShell({ level, aiMode, children }: { level: string; aiMode: "openai" | "offline"; children: ReactNode }) {
  const path = usePathname();
  const immersive = path === "/videos";
  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <Brand level={level} />
        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {TABS.map((t) => {
            const active = path.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold transition ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
                <span className="emoji text-xl" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between">
          <Link href="/settings" className="rounded-lg px-2 py-1 text-sm text-muted hover:text-text">
            ⚙️ Settings
          </Link>
          <ThemeToggle />
        </div>
        {aiMode === "offline" && <p className="mt-3 rounded-lg bg-surface-2 p-2 text-[11px] leading-snug text-muted">Offline content engine active. Add OPENAI_API_KEY for live AI generation, chat & voice.</p>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        {!immersive && (
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/85 px-4 py-2 backdrop-blur md:hidden">
            <Brand level={level} />
            <div className="flex items-center">
              <ThemeToggle />
              <Link href="/settings" aria-label="Settings" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2">
                <span className="emoji">⚙️</span>
              </Link>
            </div>
          </header>
        )}
        <main className={`flex-1 ${immersive ? "" : "pb-24 md:pb-8"}`}>{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className={`fixed inset-x-0 bottom-0 z-40 flex border-t md:hidden ${immersive ? "border-white/10 bg-black/70 text-white backdrop-blur" : "border-border bg-surface/95 backdrop-blur"}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? (immersive ? "text-white" : "text-accent") : immersive ? "text-white/60" : "text-muted"}`}>
              <span className={`emoji text-xl transition ${active ? "scale-110" : "opacity-70"}`} aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Brand({ level }: { level: string }) {
  return (
    <Link href="/videos" className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 font-display text-lg font-black text-white">L</span>
      <span className="leading-tight">
        <span className="block font-display text-lg font-extrabold tracking-tight">LingoLoop</span>
        <span className="block text-xs font-medium text-muted">Spanish · {level}</span>
      </span>
    </Link>
  );
}
