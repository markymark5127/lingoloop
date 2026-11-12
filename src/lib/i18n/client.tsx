"use client";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, makeT, type Locale, type T } from "./core";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: "en", t: makeT("en") });

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = () => useContext(Ctx).t;
export const useLocale = () => useContext(Ctx).locale;

export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = locale;
}

/** Switch the UI language (persists in a cookie; server components re-render). */
export function useSetLocale() {
  const router = useRouter();
  return useCallback(
    (locale: Locale) => {
      writeLocaleCookie(locale);
      router.refresh();
    },
    [router],
  );
}
