/**
 * Spaced repetition scheduling (SM-2 variant).
 * quality: 0-5 (0 = blackout, 3 = correct with effort, 5 = perfect).
 */

export interface SrsState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: Date;
}

export const MIN_EASE = 1.3;
const DAY = 86_400_000;

export function initialSrs(now: Date): SrsState {
  return { ease: 2.5, intervalDays: 0, repetitions: 0, dueAt: now };
}

export function review(state: SrsState, quality: number, now: Date): SrsState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease, intervalDays, repetitions } = state;

  if (q < 3) {
    // Lapse: start over, review again soon (10 minutes).
    repetitions = 0;
    intervalDays = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
    return { ease: r2(ease), intervalDays, repetitions, dueAt: new Date(now.getTime() + 10 * 60_000) };
  }

  repetitions += 1;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 3;
  else intervalDays = Math.round(intervalDays * ease * 10) / 10;

  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ease: r2(ease), intervalDays, repetitions, dueAt: new Date(now.getTime() + intervalDays * DAY) };
}

/** Map an answer outcome to SM-2 quality. Fast correct answers score higher. */
export function qualityFromAnswer(correct: boolean, timeMs?: number, attemptsBefore = 0): number {
  if (!correct) return attemptsBefore > 0 ? 1 : 2;
  if (attemptsBefore > 0) return 3;
  if (timeMs !== undefined && timeMs < 4000) return 5;
  return 4;
}

export function isDue(state: Pick<SrsState, "dueAt">, now: Date) {
  return state.dueAt.getTime() <= now.getTime();
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}
