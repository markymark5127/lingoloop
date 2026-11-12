/**
 * Generated and starter content stores every translation side by side
 * (paragraph.en / paragraph.ja, scene.translation / scene.translation_ja, question.q / q_ja …),
 * so ONE stored item serves learners of every native language. Before content leaves the server
 * we project it onto the learner's language, keeping the English field names the UI reads.
 */
import type { Locale } from "./core";

interface Q {
  q: string;
  options: string[];
  answer?: number;
  q_ja?: string;
  options_ja?: string[];
}
interface Para {
  es: string;
  en: string;
  ja?: string;
}
interface Scene {
  translation: string;
  translation_ja?: string;
}
interface AnyBody {
  questions?: Q[];
  scenes?: Scene[];
  chapters?: { paragraphs: Para[]; questions: Q[] }[];
  summary_ja?: string;
}

export function localizeQuestion<T extends Q>(q: T, locale: Locale): T {
  if (locale !== "ja") return q;
  const options = q.options_ja?.length === q.options.length ? q.options_ja : q.options;
  return { ...q, q: q.q_ja || q.q, options };
}

export function localizeBody<B>(body: B, locale: Locale): B {
  if (locale !== "ja" || !body || typeof body !== "object") return body;
  const b = body as AnyBody;
  return {
    ...b,
    questions: b.questions?.map((q) => localizeQuestion(q, locale)),
    scenes: b.scenes?.map((s) => ({ ...s, translation: s.translation_ja || s.translation })),
    chapters: b.chapters?.map((ch) => ({
      ...ch,
      paragraphs: ch.paragraphs.map((p) => ({ ...p, en: p.ja || p.en })),
      questions: ch.questions.map((q) => localizeQuestion(q, locale)),
    })),
  } as B;
}

export function localizeContent<R extends { summary?: string | null; body: unknown }>(row: R, locale: Locale): R {
  if (locale !== "ja") return row;
  const summaryJa = (row.body as AnyBody | null)?.summary_ja;
  return { ...row, summary: summaryJa || row.summary, body: localizeBody(row.body, locale) };
}
