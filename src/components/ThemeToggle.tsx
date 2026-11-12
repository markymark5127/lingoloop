"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
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
  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2">
      <span className="emoji" aria-hidden>
        {dark === null ? "🌓" : dark ? "🌙" : "☀️"}
      </span>
    </button>
  );
}

/** Inline script that applies the saved/system theme before paint. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
