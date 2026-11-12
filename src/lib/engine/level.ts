/**
 * CEFR bands are used as approximate difficulty bands, not certification.
 * Level changes are driven only by assessed performance and retention, never by time spent.
 */
import { translate, type Locale } from "../i18n/core";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

/** Strong (well-retained) words needed before being promoted *to* each level. */
export const STRONG_WORDS_FOR: Record<Cefr, number> = { A1: 0, A2: 40, B1: 150, B2: 400, C1: 900, C2: 1800 };
export const MIN_ANSWERS_FOR_CHANGE = 20;

export interface LevelInput {
  current: Cefr;
  strongWords: number;
  /** accuracy over the most recent assessed answers (0..1) */
  recentAccuracy: number;
  recentAnswers: number;
  /** language for the human-readable reason */
  locale?: Locale;
}

export interface LevelDecision {
  level: Cefr;
  change: "up" | "down" | "same";
  reason: string;
}

export function suggestLevel(i: LevelInput): LevelDecision {
  const idx = CEFR_LEVELS.indexOf(i.current);
  const t = (k: string, v?: Record<string, string | number>) => translate(i.locale ?? "en", k, v);
  if (i.recentAnswers < MIN_ANSWERS_FOR_CHANGE) {
    return { level: i.current, change: "same", reason: t("Need {n} more answered exercises to reassess", { n: MIN_ANSWERS_FOR_CHANGE - i.recentAnswers }) };
  }
  const next = CEFR_LEVELS[idx + 1];
  if (next && i.recentAccuracy >= 0.8 && i.strongWords >= STRONG_WORDS_FOR[next]) {
    return { level: next, change: "up", reason: t("{pct}% accuracy with {n} well-retained words", { pct: Math.round(i.recentAccuracy * 100), n: i.strongWords }) };
  }
  if (idx > 0 && i.recentAccuracy < 0.45) {
    return { level: CEFR_LEVELS[idx - 1], change: "down", reason: t("Recent accuracy {pct}% — easing difficulty", { pct: Math.round(i.recentAccuracy * 100) }) };
  }
  const need = next ? Math.max(0, STRONG_WORDS_FOR[next] - i.strongWords) : 0;
  return {
    level: i.current,
    change: "same",
    reason: next ? (need > 0 ? t("{n} more strong words to reach {level}", { n: need, level: next }) : t("Keep accuracy at 80%+ to reach {level}", { level: next })) : t("Top band"),
  };
}

/**
 * Exercise difficulty 1..5 within a level, from recent accuracy. Rises when the learner is
 * consistently right and falls when they struggle.
 */
export function difficultyFor(level: Cefr, recentAccuracy: number, recentAnswers: number): number {
  const base = Math.min(5, 1 + CEFR_LEVELS.indexOf(level));
  if (recentAnswers < 5) return base;
  if (recentAccuracy >= 0.85) return Math.min(5, base + 1);
  if (recentAccuracy < 0.5) return Math.max(1, base - 1);
  return base;
}
