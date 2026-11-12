/**
 * Learning service: the single place where activities update the shared learner model.
 * Every tab (videos, stories, games, talk) calls into these functions, so a word you miss in a
 * game shows up in your next recommended story, and a word you use in conversation counts as
 * production practice.
 *
 * Functions take a service-role Supabase client plus a *verified* user id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyAnswer,
  applyExposure,
  initialSrs,
  overall,
  qualityFromAnswer,
  review,
  type Skill,
  type SkillState,
  type UserWordState,
  type VocabEntry,
  buildFormIndex,
  matchVocab,
  suggestLevel,
  type Cefr,
  rankContent,
  type ContentCandidate,
  CEFR_LEVELS,
} from "@/lib/engine";
import type { WordHint } from "@/lib/ai/types";

export type Activity = "video" | "story" | "game" | "talk" | "review";

export interface VocabRow {
  id: string;
  lemma: string;
  translation: string;
  part_of_speech: string;
  article: string | null;
  emoji: string | null;
  cefr: string;
  forms: string[];
  example: string | null;
  example_translation: string | null;
}

export interface UserVocabRow {
  user_id: string;
  vocab_id: string;
  saved: boolean;
  exposures: number;
  recognition: number;
  listening: number;
  production: number;
  ease: number;
  interval_days: number;
  repetitions: number;
  due_at: string | null;
  correct_count: number;
  incorrect_count: number;
  last_seen_at: string | null;
  last_reviewed_at: string | null;
}

export interface LearningProfile {
  user_id: string;
  native_language: string;
  target_language: string;
  level: Cefr;
  interests: string[];
  daily_goal_minutes: number;
  onboarded: boolean;
  show_translations: boolean;
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

// ------------------------------------------------------------------ vocabulary bank
let vocabCache: { at: number; rows: VocabRow[] } | null = null;

export async function loadVocab(db: SupabaseClient, fresh = false): Promise<VocabRow[]> {
  if (!fresh && vocabCache && Date.now() - vocabCache.at < 60_000) return vocabCache.rows;
  const rows = must(await db.from("vocabulary_items").select("*").eq("language", "es").limit(5000), "load vocab") as VocabRow[];
  vocabCache = { at: Date.now(), rows };
  return rows;
}

export function toEntry(v: VocabRow): VocabEntry {
  return {
    id: v.id,
    lemma: v.lemma,
    translation: v.translation,
    emoji: v.emoji,
    article: v.article,
    pos: v.part_of_speech,
    example: v.example,
    exampleTranslation: v.example_translation,
  };
}

export async function vocabIdsInText(db: SupabaseClient, text: string): Promise<string[]> {
  const vocab = await loadVocab(db);
  const items = vocab.map((v) => ({ id: v.id, lemma: v.lemma, forms: v.forms }));
  return matchVocab(text, items, buildFormIndex(items));
}

/** Link content to the vocabulary it contains (introduced = not in learner's known set at creation). */
export async function linkContentVocabulary(db: SupabaseClient, contentId: string, text: string, focusIds: string[] = []) {
  const ids = await vocabIdsInText(db, text);
  if (!ids.length) return [];
  const focus = new Set(focusIds);
  const rows = ids.map((vocab_id) => ({ content_id: contentId, vocab_id, role: focus.has(vocab_id) ? "reinforced" : "introduced" }));
  must(await db.from("content_vocabulary").upsert(rows, { onConflict: "content_id,vocab_id" }), "link vocab");
  return ids;
}

// ------------------------------------------------------------------ learner state
export async function getProfile(db: SupabaseClient, userId: string): Promise<LearningProfile> {
  const p = must(await db.from("learning_profiles").select("*").eq("user_id", userId).single(), "load profile") as LearningProfile;
  return p;
}

export async function loadUserWordRows(db: SupabaseClient, userId: string): Promise<UserVocabRow[]> {
  return must(await db.from("user_vocabulary").select("*").eq("user_id", userId).limit(10000), "load user vocab") as UserVocabRow[];
}

export function toWordState(r: UserVocabRow): UserWordState {
  return {
    vocabId: r.vocab_id,
    skills: { recognition: r.recognition, listening: r.listening, production: r.production },
    dueAt: r.due_at ? new Date(r.due_at) : null,
    incorrectCount: r.incorrect_count,
    exposures: r.exposures,
  };
}

export async function loadUserWords(db: SupabaseClient, userId: string) {
  const rows = await loadUserWordRows(db, userId);
  return new Map(rows.map((r) => [r.vocab_id, toWordState(r)]));
}

function blankRow(userId: string, vocabId: string): UserVocabRow {
  return {
    user_id: userId,
    vocab_id: vocabId,
    saved: false,
    exposures: 0,
    recognition: 0,
    listening: 0,
    production: 0,
    ease: 2.5,
    interval_days: 0,
    repetitions: 0,
    due_at: null,
    correct_count: 0,
    incorrect_count: 0,
    last_seen_at: null,
    last_reviewed_at: null,
  };
}

/** Drop DB-managed columns so mixed insert/update upserts send a uniform column set. */
function forUpsert(rows: UserVocabRow[]) {
  return rows.map((r) => {
    const { created_at: _c, ...rest } = r as UserVocabRow & { created_at?: string };
    void _c;
    return rest;
  });
}

async function rowsFor(db: SupabaseClient, userId: string, vocabIds: string[]) {
  if (!vocabIds.length) return new Map<string, UserVocabRow>();
  const existing = must(
    await db.from("user_vocabulary").select("*").eq("user_id", userId).in("vocab_id", vocabIds),
    "load rows",
  ) as UserVocabRow[];
  const map = new Map(existing.map((r) => [r.vocab_id, r]));
  for (const id of vocabIds) if (!map.has(id)) map.set(id, blankRow(userId, id));
  return map;
}

export async function logEvent(
  db: SupabaseClient,
  userId: string,
  e: { activity: Activity; event_type: string; content_id?: string | null; vocab_id?: string | null; skill?: string | null; correct?: boolean | null; seconds?: number; meta?: Record<string, unknown> },
) {
  must(await db.from("learning_events").insert({ user_id: userId, seconds: 0, meta: {}, ...e }), "log event");
}

/** Passive exposure: word appeared in content the learner consumed. Capped — cannot make a word strong. */
export async function recordExposure(db: SupabaseClient, userId: string, vocabIds: string[], skill: Skill, activity: Activity, contentId?: string) {
  const unique = [...new Set(vocabIds)];
  const rows = await rowsFor(db, userId, unique);
  const now = new Date().toISOString();
  const updated = [...rows.values()].map((r) => {
    const s = applyExposure({ recognition: r.recognition, listening: r.listening, production: r.production }, skill);
    return { ...r, ...s, exposures: r.exposures + 1, last_seen_at: now, due_at: r.due_at ?? now };
  });
  if (updated.length) must(await db.from("user_vocabulary").upsert(forUpsert(updated), { onConflict: "user_id,vocab_id" }), "exposure");
  await logEvent(db, userId, { activity, event_type: "exposure", content_id: contentId ?? null, skill, meta: { words: unique.length } });
}

export interface AnswerInput {
  vocabId: string;
  skill: Skill;
  correct: boolean;
  weight?: number;
  timeMs?: number;
  attemptsBefore?: number;
}

/** Assessed answer: updates the skill estimate and the spaced-review schedule. */
export async function recordAnswers(db: SupabaseClient, userId: string, answers: AnswerInput[], activity: Activity, contentId?: string | null, meta: Record<string, unknown> = {}) {
  if (!answers.length) return [];
  const rows = await rowsFor(db, userId, answers.map((a) => a.vocabId));
  const now = new Date();
  for (const a of answers) {
    const r = rows.get(a.vocabId)!;
    const skills: SkillState = applyAnswer({ recognition: r.recognition, listening: r.listening, production: r.production }, a.skill, a.correct, a.weight ?? 1);
    const prev = r.due_at ? { ease: r.ease, intervalDays: r.interval_days, repetitions: r.repetitions, dueAt: new Date(r.due_at) } : initialSrs(now);
    const next = review(prev, qualityFromAnswer(a.correct, a.timeMs, a.attemptsBefore ?? 0), now);
    rows.set(a.vocabId, {
      ...r,
      ...skills,
      ease: next.ease,
      interval_days: next.intervalDays,
      repetitions: next.repetitions,
      due_at: next.dueAt.toISOString(),
      correct_count: r.correct_count + (a.correct ? 1 : 0),
      incorrect_count: r.incorrect_count + (a.correct ? 0 : 1),
      last_reviewed_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    });
  }
  const list = [...rows.values()];
  must(await db.from("user_vocabulary").upsert(forUpsert(list), { onConflict: "user_id,vocab_id" }), "answers");
  must(
    await db.from("learning_events").insert(
      answers.map((a) => ({ user_id: userId, activity, event_type: "answer", content_id: contentId ?? null, vocab_id: a.vocabId, skill: a.skill, correct: a.correct, seconds: 0, meta })),
    ),
    "answer events",
  );
  return list;
}

// ------------------------------------------------------------------ performance & level
export async function recentAccuracy(db: SupabaseClient, userId: string, n = 40) {
  const rows = must(
    await db.from("learning_events").select("correct").eq("user_id", userId).eq("event_type", "answer").order("created_at", { ascending: false }).limit(n),
    "accuracy",
  ) as { correct: boolean }[];
  const total = rows.length;
  const correct = rows.filter((r) => r.correct).length;
  return { accuracy: total ? correct / total : 0, total };
}

/** Re-evaluate the learner's band from performance + retention (never from time spent). */
export async function reassessLevel(db: SupabaseClient, userId: string) {
  const profile = await getProfile(db, userId);
  const words = await loadUserWordRows(db, userId);
  const strong = words.filter((w) => overall({ recognition: w.recognition, listening: w.listening, production: w.production }) >= 0.6).length;
  const { accuracy, total } = await recentAccuracy(db, userId);
  const decision = suggestLevel({ current: profile.level, strongWords: strong, recentAccuracy: accuracy, recentAnswers: total });
  if (decision.change !== "same") {
    must(await db.from("learning_profiles").update({ level: decision.level, updated_at: new Date().toISOString() }).eq("user_id", userId), "level");
    await logEvent(db, userId, { activity: "review", event_type: "level_change", meta: { from: profile.level, to: decision.level, reason: decision.reason } });
  }
  return decision;
}

// ------------------------------------------------------------------ personalization
export async function generationContext(db: SupabaseClient, userId: string, genre?: string) {
  const [profile, vocab, words] = await Promise.all([getProfile(db, userId), loadVocab(db), loadUserWords(db, userId)]);
  const now = Date.now();
  const scored = vocab
    .map((v) => ({ v, w: words.get(v.id) }))
    .filter((x) => x.w)
    .map((x) => ({ ...x, o: overall(x.w!.skills), due: x.w!.dueAt ? x.w!.dueAt.getTime() <= now : false }));
  const focus = scored
    .filter((x) => x.due || x.o < 0.5 || x.w!.incorrectCount > 0)
    .sort((a, b) => Number(b.due) - Number(a.due) || a.o - b.o)
    .slice(0, 5)
    .map((x) => x.v);
  const known = scored.filter((x) => x.o >= 0.3).map((x) => x.v.lemma);
  // Brand-new learners: lean on the level's core words.
  const levelIdx = CEFR_LEVELS.indexOf(profile.level);
  const core = vocab.filter((v) => CEFR_LEVELS.indexOf(v.cefr as Cefr) <= levelIdx);
  const pickedFocus = focus.length ? focus : core.filter((v) => v.part_of_speech === "noun" && v.emoji).sort(() => Math.random() - 0.5).slice(0, 3);
  const hint = (v: VocabRow): WordHint => ({ lemma: v.lemma, translation: v.translation, article: v.article, emoji: v.emoji, pos: v.part_of_speech });
  return {
    profile,
    focusIds: pickedFocus.map((v) => v.id),
    ctx: {
      level: profile.level,
      genre: genre ?? profile.interests[0] ?? "comedy",
      interests: profile.interests,
      focusWords: pickedFocus.map(hint),
      knownWords: known.length ? known : core.slice(0, 50).map((v) => v.lemma),
    },
  };
}

export interface RankedContentRow {
  id: string;
  kind: string;
  title: string;
  genre: string;
  cefr: string;
  summary: string | null;
  series: string | null;
  series_order: number | null;
  body: unknown;
  source: string;
  created_at: string;
  progress: { position: number; completed: boolean; bookmarked: boolean; liked: boolean; skipped: boolean; quiz_correct: number; quiz_total: number } | null;
  media: { kind: string; public_url: string | null; duration_ms: number | null; meta: Record<string, unknown> }[];
  recommendation: { score: number; reasons: string[]; counts: Record<string, number>; newRatio: number };
}

/**
 * Personalized content list. `userDb` is the RLS-scoped client, so the learner only ever sees
 * content they're allowed to read.
 */
export async function rankedContent(userDb: SupabaseClient, adminDb: SupabaseClient, userId: string, kind: "video" | "story", genre?: string) {
  let q = userDb
    .from("content_items")
    .select("id, kind, title, genre, cefr, summary, series, series_order, body, source, created_at, media_assets(kind, public_url, duration_ms, meta), content_vocabulary(vocab_id)")
    .eq("kind", kind)
    .eq("status", "ready")
    .limit(200);
  if (genre) q = q.eq("genre", genre);
  const items = must(await q, "content") as unknown as (Omit<RankedContentRow, "progress" | "media" | "recommendation"> & {
    media_assets: RankedContentRow["media"];
    content_vocabulary: { vocab_id: string }[];
  })[];
  const [profile, words, vocab, progressRows] = await Promise.all([
    getProfile(adminDb, userId),
    loadUserWords(adminDb, userId),
    loadVocab(adminDb),
    userDb.from("content_progress").select("*").eq("user_id", userId),
  ]);
  const progress = new Map(((progressRows.data ?? []) as (RankedContentRow["progress"] & { content_id: string })[]).map((p) => [p.content_id, p]));
  const lemma = new Map(vocab.map((v) => [v.id, v.lemma]));
  const candidates: ContentCandidate[] = items.map((c) => ({
    id: c.id,
    title: c.title,
    genre: c.genre,
    cefr: c.cefr as Cefr,
    vocabIds: c.content_vocabulary.map((x) => x.vocab_id),
    completed: progress.get(c.id)?.completed,
    skipped: progress.get(c.id)?.skipped,
  }));
  const ranked = rankContent(candidates, { level: profile.level, interests: profile.interests, words, now: new Date(), lemmaOf: (id) => lemma.get(id) });
  const byId = new Map(items.map((c) => [c.id, c]));
  return ranked.map((r): RankedContentRow => {
    const c = byId.get(r.id)!;
    const { media_assets, content_vocabulary: _cv, ...rest } = c;
    void _cv;
    return { ...rest, media: media_assets, progress: progress.get(c.id) ?? null, recommendation: { score: r.score, reasons: r.reasons, counts: r.counts, newRatio: r.newRatio } };
  });
}
