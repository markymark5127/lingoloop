"use client";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n/core";
import { useLocale, useSetLocale, useT } from "@/lib/i18n/client";

/** UI language toggle for pages outside the app (landing, auth). Inside the app it's a profile setting. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();
  return (
    <div role="group" aria-label={t("Language")} className="glass flex items-center gap-0.5 rounded-full p-1 text-xs font-semibold">
      <Languages className="ml-1.5 h-4 w-4 text-muted" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={`rounded-full px-2.5 py-1 transition ${locale === l ? "bg-accent-gradient text-white" : "text-muted hover:text-text"}`}
        >
          {LOCALE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
