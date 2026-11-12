"use client";
import { useEffect, useRef } from "react";

/**
 * Tracks *active* time: counts seconds only while the tab is visible and the user has interacted
 * in the last 60s. Flushes to /api/events every ~30s and on hide.
 */
export function useActivityTimer(activity: "video" | "story" | "game" | "talk") {
  const pending = useRef(0);
  const lastInput = useRef(0);

  useEffect(() => {
    lastInput.current = Date.now();
    const bump = () => (lastInput.current = Date.now());
    const flush = () => {
      const s = Math.min(60, Math.round(pending.current));
      if (s < 1) return;
      pending.current = 0;
      const body = JSON.stringify({ activity, seconds: s });
      if (document.visibilityState === "hidden" && navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      else fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const tick = setInterval(() => {
      const playing = document.querySelector("video:not([paused])") as HTMLVideoElement | null;
      const active = document.visibilityState === "visible" && (Date.now() - lastInput.current < 60_000 || (playing && !playing.paused));
      if (active) pending.current += 1;
      if (pending.current >= 30) flush();
    }, 1000);
    const onVis = () => document.visibilityState === "hidden" && flush();
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      flush();
      ["pointerdown", "keydown", "scroll", "touchstart"].forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activity]);
}
