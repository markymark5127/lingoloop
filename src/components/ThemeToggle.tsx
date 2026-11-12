"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read theme applied by the pre-paint script
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }
  const Icon = dark ? Moon : Sun;
  return (
    <button onClick={toggle} aria-label={dark ? t("Switch to light theme") : t("Switch to dark theme")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text">
      <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
    </button>
  );
}

/** Inline script that applies the saved/system theme before paint. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
