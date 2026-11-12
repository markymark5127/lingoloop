import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, makeT, negotiateLocale, type Locale } from "./core";

/** Locale for pages: explicit cookie, else the browser's Accept-Language. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return negotiateLocale((await headers()).get("accept-language"));
}

export async function getT() {
  return makeT(await getLocale());
}
