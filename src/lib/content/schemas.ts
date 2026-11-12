import { z } from "zod";
import { CEFR_LEVELS } from "@/lib/engine/level";

export const GENRES = ["comedy", "mystery", "sci-fi", "travel", "everyday", "romance", "food", "adventure"] as const;
export const Genre = z.enum(GENRES);
export const Cefr = z.enum(CEFR_LEVELS);

export const SCENE_BACKGROUNDS = ["sunset", "ocean", "forest", "night", "candy", "desert", "city", "space"] as const;

export const Question = z.object({
  q: z.string().min(3).max(200),
  options: z.array(z.string().min(1).max(120)).min(2).max(4),
  answer: z.number().int().min(0).max(3),
});
export type Question = z.infer<typeof Question>;

export const VideoScene = z.object({
  text: z.string().min(2).max(160),
  translation: z.string().min(2).max(200),
  emoji: z.string().min(1).max(16),
  bg: z.enum(SCENE_BACKGROUNDS).catch("sunset"),
});

export const VideoBody = z.object({
  scenes: z.array(VideoScene).min(3).max(8),
  questions: z.array(Question).min(1).max(3),
  timings: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
});
export type VideoBody = z.infer<typeof VideoBody>;

export const VideoScript = z.object({
  title: z.string().min(2).max(80),
  summary: z.string().min(2).max(240),
  genre: Genre,
  body: VideoBody,
});
export type VideoScript = z.infer<typeof VideoScript>;

export const Paragraph = z.object({ es: z.string().min(2).max(700), en: z.string().min(2).max(800) });
export const Chapter = z.object({
  title: z.string().min(1).max(80),
  paragraphs: z.array(Paragraph).min(1).max(8),
  questions: z.array(Question).min(1).max(4),
});
export const StoryBody = z.object({
  characters: z.array(z.string()).max(6).default([]),
  chapters: z.array(Chapter).min(1).max(6),
});
export type StoryBody = z.infer<typeof StoryBody>;

export const StoryScript = z.object({
  title: z.string().min(2).max(80),
  summary: z.string().min(2).max(300),
  genre: Genre,
  body: StoryBody,
});
export type StoryScript = z.infer<typeof StoryScript>;

/** Strip correct answers before sending content to the browser. */
export function publicQuestions(qs: Question[]) {
  return qs.map(({ q, options }) => ({ q, options }));
}

// ----------------------------------------------------------- conversation
export const Correction = z.object({
  original: z.string().max(300),
  corrected: z.string().max(300),
  explanation: z.string().max(400),
});
export type Correction = z.infer<typeof Correction>;

export const TutorTurn = z.object({
  reply: z.string().min(1).max(600),
  translation: z.string().max(800).default(""),
  corrections: z.array(Correction).max(5).default([]),
});
export type TutorTurn = z.infer<typeof TutorTurn>;

export const ConversationSummary = z.object({
  overview: z.string().max(600),
  strengths: z.array(z.string().max(200)).max(5),
  corrections: z.array(Correction).max(8),
  usefulPhrases: z.array(z.object({ es: z.string(), en: z.string() })).max(8),
  nextStep: z.string().max(300),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

// ----------------------------------------------------------- appropriateness checks
const MAX_AVG_WORDS: Record<string, number> = { A1: 11, A2: 15, B1: 20, B2: 26, C1: 32, C2: 40 };
const ENGLISH_MARKERS = new Set(["the", "and", "is", "are", "you", "with", "this", "that", "what", "have", "was", "of", "it"]);

export interface ContentCheck {
  ok: boolean;
  problems: string[];
}

/** Heuristic checks that generated target-language text is Spanish and roughly level-appropriate. */
export function checkTargetText(texts: string[], level: string): ContentCheck {
  const problems: string[] = [];
  const all = texts.join(" ");
  const sentenceList = all.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
  const wordsAll = all.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const avg = wordsAll.length / Math.max(1, sentenceList.length);
  if (avg > (MAX_AVG_WORDS[level] ?? 20)) problems.push(`Sentences too long for ${level} (avg ${avg.toFixed(1)} words)`);
  const english = wordsAll.filter((w) => ENGLISH_MARKERS.has(w)).length;
  if (wordsAll.length > 0 && english / wordsAll.length > 0.08) problems.push("Text appears to contain English");
  return { ok: problems.length === 0, problems };
}
