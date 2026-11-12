/**
 * Per-word, per-skill mastery model.
 *
 * Each word has three independent estimates in [0, 1]:
 *  - recognition: understanding the word when reading/seeing it
 *  - listening:   understanding the word when hearing it
 *  - production:  using the word yourself (typing/speaking)
 *
 * Passive exposure (watching, reading) nudges recognition but is capped, so time spent alone
 * can never push a word to "strong". Only correct, assessed answers do that.
 */

export type Skill = "recognition" | "listening" | "production";
export const SKILLS: Skill[] = ["recognition", "listening", "production"];

export interface SkillState {
  recognition: number;
  listening: number;
  production: number;
}

export const EMPTY_SKILLS: SkillState = { recognition: 0, listening: 0, production: 0 };

/** Max value passive exposure alone can reach. */
export const EXPOSURE_CAP = 0.3;
const EXPOSURE_STEP = 0.05;
const LEARN_RATE_CORRECT = 0.3;
const LEARN_RATE_WRONG = 0.4;

export type MasteryLabel = "new" | "needs-practice" | "developing" | "strong";

export function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Record a passive exposure (word seen/heard in content). */
export function applyExposure(state: SkillState, skill: Skill = "recognition"): SkillState {
  const cur = state[skill];
  if (cur >= EXPOSURE_CAP) return state;
  return { ...state, [skill]: Math.min(EXPOSURE_CAP, cur + EXPOSURE_STEP) };
}

/**
 * Record an assessed answer for a skill. Correct answers move the estimate toward 1,
 * incorrect answers move it toward 0 (slightly faster, so errors are taken seriously).
 * `weight` (0..1) scales the update, e.g. easy multiple-choice counts less than free production.
 */
export function applyAnswer(state: SkillState, skill: Skill, correct: boolean, weight = 1): SkillState {
  const cur = state[skill];
  const rate = (correct ? LEARN_RATE_CORRECT : LEARN_RATE_WRONG) * clamp01(weight);
  const target = correct ? 1 : 0;
  const next = clamp01(cur + rate * (target - cur));
  const out: SkillState = { ...state, [skill]: round3(next) };
  // Recognizing a word you can produce is implied: production success lifts recognition a little.
  if (correct && skill === "production") out.recognition = round3(Math.max(out.recognition, next * 0.8));
  if (correct && skill === "listening") out.recognition = round3(Math.max(out.recognition, next * 0.6));
  return out;
}

export function label(value: number, seen = true): MasteryLabel {
  if (!seen) return "new";
  if (value >= 0.7) return "strong";
  if (value >= 0.35) return "developing";
  return "needs-practice";
}

/** Overall mastery of a word: recognition-weighted mean. */
export function overall(s: SkillState): number {
  return round3(s.recognition * 0.45 + s.listening * 0.3 + s.production * 0.25);
}

export function weakestSkill(s: SkillState): Skill {
  return SKILLS.reduce((a, b) => (s[b] < s[a] ? b : a));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
