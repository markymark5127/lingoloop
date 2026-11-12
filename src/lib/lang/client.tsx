"use client";
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { setSpeechTarget } from "@/lib/client/speech";
import { kanaToRomaji, type TargetLang } from "./index";

const Ctx = createContext<TargetLang>("es");
const LevelCtx = createContext<string>("A1");

/** The language the learner is studying (and their level in it), for client components. */
export function TargetProvider({ lang, level = "A1", children }: { lang: TargetLang; level?: string; children: ReactNode }) {
  useEffect(() => setSpeechTarget(lang), [lang]);
  setSpeechTarget(lang);
  return (
    <Ctx.Provider value={lang}>
      <LevelCtx.Provider value={level}>{children}</LevelCtx.Provider>
    </Ctx.Provider>
  );
}

export const useTarget = () => useContext(Ctx);
export const useLevel = () => useContext(LevelCtx);

// ---------------------------------------------------------------- Japanese reading aid
export type ReadingMode = "romaji" | "kana" | "off";
/** "auto" fades the aid as the learner levels up. */
export type ReadingPref = ReadingMode | "auto";
const KEY = "ll_reading";
const EVENT = "ll-reading-change";

/** Scaffolding fades with level: romaji for beginners, furigana in kana, then nothing. */
export function autoReadingMode(level: string): ReadingMode {
  return level === "A1" ? "romaji" : level === "A2" || level === "B1" ? "kana" : "off";
}

function read(): ReadingPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "romaji" || v === "kana" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

function subscribe(on: () => void) {
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
}

/**
 * How Japanese readings are shown above words: [effective mode, set preference, preference].
 * The preference is per device; "auto" (default) follows the learner's level.
 */
export function useReadingMode(): [ReadingMode, (m: ReadingPref) => void, ReadingPref] {
  const pref = useSyncExternalStore(subscribe, read, () => "auto" as const);
  const level = useLevel();
  const mode = pref === "auto" ? autoReadingMode(level) : pref;
  const set = useCallback((m: ReadingPref) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode: the choice can't persist */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [mode, set, pref];
}

/** Format a kana reading for display in the chosen mode (null when hidden). */
export function formatReading(reading: string | null | undefined, mode: ReadingMode): string | null {
  if (!reading || mode === "off") return null;
  return mode === "romaji" ? kanaToRomaji(reading) : reading.replace(/\s+/g, " ");
}
