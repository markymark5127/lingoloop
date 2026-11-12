/**
 * Content recommendation: score videos/stories for a learner.
 *
 * The ideal item is mostly familiar vocabulary, includes several words due for review (or that
 * the learner has recently got wrong), and introduces only a handful of new words. Interest and
 * level match then break ties. Everything here is deterministic and unit-tested.
 */
import { overall, type SkillState } from "./mastery";
import { CEFR_LEVELS, type Cefr } from "./level";

export interface UserWordState {
  vocabId: string;
  skills: SkillState;
  dueAt: Date | null;
  incorrectCount: number;
  exposures: number;
}

export interface ContentCandidate {
  id: string;
  title: string;
  genre: string;
  cefr: Cefr;
  vocabIds: string[];
  completed?: boolean;
  skipped?: boolean;
}

export interface LearnerContext {
  level: Cefr;
  interests: string[];
  words: Map<string, UserWordState>;
  now: Date;
  lemmaOf?: (vocabId: string) => string | undefined;
}

export type WordBucket = "known" | "learning" | "review" | "new";

export interface Recommendation {
  id: string;
  score: number;
  reasons: string[];
  counts: Record<WordBucket, number>;
  reviewWordIds: string[];
  newRatio: number;
}

export const IDEAL_MAX_NEW_RATIO = 0.25;

export function bucketFor(w: UserWordState | undefined, now: Date): WordBucket {
  if (!w || (w.exposures === 0 && overall(w.skills) === 0)) return "new";
  const o = overall(w.skills);
  const due = w.dueAt !== null && w.dueAt.getTime() <= now.getTime();
  if (due || (w.incorrectCount > 0 && o < 0.5) || o < 0.2) return "review";
  if (o >= 0.6) return "known";
  return "learning";
}

export function scoreContent(c: ContentCandidate, ctx: LearnerContext): Recommendation {
  const counts: Record<WordBucket, number> = { known: 0, learning: 0, review: 0, new: 0 };
  const reviewWordIds: string[] = [];
  for (const id of c.vocabIds) {
    const b = bucketFor(ctx.words.get(id), ctx.now);
    counts[b]++;
    if (b === "review") reviewWordIds.push(id);
  }
  const total = Math.max(1, c.vocabIds.length);
  const newRatio = counts.new / total;
  const reasons: string[] = [];
  let score = 50;

  // Reinforce weak / due vocabulary (capped so one item can't dominate purely on reviews).
  const reviewHits = Math.min(4, counts.review);
  score += reviewHits * 8;
  if (counts.review > 0) {
    const names = reviewWordIds
      .slice(0, 3)
      .map((id) => ctx.lemmaOf?.(id))
      .filter(Boolean);
    reasons.push(names.length ? `Reviews words you're practicing: ${names.join(", ")}` : `Reviews ${counts.review} words due for practice`);
  }

  // Manageable amount of new material.
  if (counts.new > 0 && newRatio <= IDEAL_MAX_NEW_RATIO) {
    score += 6;
    reasons.push(`Introduces ${counts.new} new word${counts.new === 1 ? "" : "s"}`);
  } else if (newRatio > IDEAL_MAX_NEW_RATIO) {
    score -= Math.round((newRatio - IDEAL_MAX_NEW_RATIO) * 60);
  }

  // Familiar foundation.
  score += Math.round(((counts.known + counts.learning * 0.7) / total) * 10);

  // Interests.
  if (ctx.interests.map((i) => i.toLowerCase()).includes(c.genre.toLowerCase())) {
    score += 15;
    reasons.push(`Matches your interest in ${c.genre}`);
  }

  // Level fit: harder-than-level is penalized more than easier.
  const diff = CEFR_LEVELS.indexOf(c.cefr) - CEFR_LEVELS.indexOf(ctx.level);
  if (diff > 0) score -= diff * 14;
  else if (diff < 0) score -= -diff * 6;
  else reasons.push(`At your level (${ctx.level})`);

  if (c.completed) score -= 40;
  if (c.skipped) score -= 25;

  return { id: c.id, score, reasons, counts, reviewWordIds, newRatio: Math.round(newRatio * 100) / 100 };
}

export function rankContent(items: ContentCandidate[], ctx: LearnerContext): Recommendation[] {
  return items
    .map((c) => scoreContent(c, ctx))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
