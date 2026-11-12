import Link from "next/link";
import { WifiOff } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Offline · LingoLoop" };

/** Shown by the service worker when a page isn't cached and there's no connection. */
export default async function Offline() {
  const t = await getT();
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="glass w-full max-w-sm space-y-4 rounded-[32px] p-7 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent-gradient text-white shadow-lg shadow-accent/30">
          <WifiOff className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-extrabold">{t("You're offline")}</h1>
        <p className="text-muted">{t("This page isn't saved on your device yet. Videos you've watched and pages you've visited still work offline.")}</p>
        <Link href="/home" className="inline-flex min-h-11 items-center rounded-full bg-accent-gradient px-6 font-semibold text-white">
          {t("Try again")}
        </Link>
      </div>
    </main>
  );
}
