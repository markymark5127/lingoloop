"use client";
import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Registers the service worker, offers "Install app", and shows an offline banner. */
export function ServiceWorker() {
  const t = useT();
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      let dismissed = false;
      try {
        dismissed = localStorage.getItem("ll_install_dismissed") === "1";
      } catch {}
      if (!dismissed) setInstall(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstall(null);
    const net = () => setOffline(!navigator.onLine);
    net();
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);

  return (
    <>
      {offline && (
        <div role="status" className="glass-strong fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg">
          <WifiOff className="h-4 w-4 text-warning" aria-hidden /> {t("You're offline — showing saved content")}
        </div>
      )}
      {install && (
        <div className="glass-strong fixed inset-x-3 bottom-24 z-[55] mx-auto flex max-w-md items-center gap-3 rounded-[24px] p-3 shadow-xl md:bottom-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-gradient text-white">
            <Download className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="block">{t("Install LingoLoop")}</b>
            <span className="text-muted">{t("Learn from your home screen, even offline.")}</span>
          </span>
          <button
            onClick={async () => {
              await install.prompt();
              await install.userChoice;
              setInstall(null);
            }}
            className="rounded-full bg-accent-gradient px-4 py-2 text-sm font-semibold text-white"
          >
            {t("Install")}
          </button>
          <button
            aria-label={t("Dismiss")}
            onClick={() => {
              try {
                localStorage.setItem("ll_install_dismissed", "1");
              } catch {}
              setInstall(null);
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}

/** Drop cached personal data (API responses) — call on sign-out / account deletion. */
export async function clearPersonalCache() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "clear-personal" });
    if ("caches" in window) await caches.delete("ll-api-v1");
  } catch {}
}
