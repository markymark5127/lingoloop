/**
 * Tiny i18n layer. UI strings are written in English in the code and looked up in a per-locale
 * dictionary keyed by that English text, so a missing translation falls back to readable English.
 * `{name}` placeholders are filled from `vars`.
 */
import { JA } from "./ja";

export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "ll_locale";
export const LOCALE_LABEL: Record<Locale, string> = { en: "English", ja: "日本語" };

const DICTS: Record<Locale, Record<string, string>> = { en: {}, ja: JA };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function toLocale(v: unknown): Locale {
  return isLocale(v) ? v : "en";
}

/** Best match from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return "en";
  for (const part of acceptLanguage.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export type Vars = Record<string, string | number>;

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const s = DICTS[locale][key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export type T = (key: string, vars?: Vars) => string;
export const makeT = (locale: Locale): T => (key, vars) => translate(locale, key, vars);

/** Language name for AI prompts. */
export const LANGUAGE_NAME: Record<Locale, string> = { en: "English", ja: "Japanese" };
