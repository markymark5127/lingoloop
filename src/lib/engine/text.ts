/**
 * Text utilities for tokenization and lenient answer comparison (Spanish and Japanese). Pure functions.
 * Japanese target text is stored word-spaced ("猫 は 寝ています。"); see lib/lang.
 */
import { isJapaneseText } from "../lang";

/** Lowercase, strip accents and punctuation. "¿Dónde?" -> "donde". Japanese: NFKC, no spaces. */
export function normalize(s: string): string {
  if (isJapaneseText(s)) return s.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase + strip punctuation but keep accents (accents are meaningful: "si" vs "sí"). */
export function cleanWord(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export interface Token {
  text: string;
  /** true if this token is a word (tappable), false for spaces/punctuation */
  word: boolean;
  /** Japanese: index of the space-separated chunk this word came from (aligns with `reading`) */
  chunk?: number;
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;

function latinTokens(sentence: string, chunk?: number): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of sentence.matchAll(WORD_RE)) {
    const i = m.index ?? 0;
    if (i > last) tokens.push({ text: sentence.slice(last, i), word: false });
    tokens.push({ text: m[0], word: true, ...(chunk !== undefined ? { chunk } : {}) });
    last = i + m[0].length;
  }
  if (last < sentence.length) tokens.push({ text: sentence.slice(last), word: false });
  return tokens;
}

/** Split a sentence into word and non-word tokens. Spanish keeps the text exactly; word-spaced
 * Japanese drops the separating spaces; unspaced Japanese falls back to Intl.Segmenter. */
export function tokenize(sentence: string): Token[] {
  if (!isJapaneseText(sentence)) return latinTokens(sentence);
  const chunks = sentence.trim().split(/\s+/).filter(Boolean);
  // A single long chunk is unsegmented free text (e.g. typed by the learner): let ICU split it.
  const unsegmented = chunks.length === 1 && chunks[0].length > 8;
  if (!unsegmented || typeof Intl === "undefined" || !("Segmenter" in Intl)) {
    return chunks.flatMap((c, i) => latinTokens(c, i));
  }
  const seg = new Intl.Segmenter("ja", { granularity: "word" });
  return [...seg.segment(sentence)].map((x) => ({ text: x.segment, word: !!x.isWordLike }));
}

/** Per-token reading for word-spaced Japanese, when `reading` has the same word boundaries. */
export function alignReading(text: string, tokens: Token[], reading: string | null | undefined): (string | null)[] {
  if (!reading) return tokens.map(() => null);
  const chunks = reading.trim().split(/\s+/).map((c) => c.replace(/[^\p{L}\p{N}ー]/gu, ""));
  if (text.trim().split(/\s+/).length !== chunks.length) return tokens.map(() => null);
  const used = new Set<number>();
  return tokens.map((t) => {
    if (!t.word || t.chunk === undefined || used.has(t.chunk)) return null;
    used.add(t.chunk);
    return chunks[t.chunk] || null;
  });
}

export function words(sentence: string): string[] {
  return tokenize(sentence)
    .filter((t) => t.word)
    .map((t) => cleanWord(t.text));
}

/** Split text into sentences, keeping terminal punctuation. */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?…。！？]+[.!?…。！？]+["»”」』]?|[^.!?…。！？]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Compare two answers ignoring case, accents and punctuation. */
export function answersMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

export interface VocabForms {
  id: string;
  lemma: string;
  forms: string[];
}

/** Build a lookup map from surface form -> vocab id. Includes naive plurals. */
export function buildFormIndex(items: VocabForms[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of items) {
    const all = new Set([it.lemma, ...it.forms].map(cleanWord));
    for (const f of [...all]) {
      // naive plural forms so "naranjas" maps to "naranja"
      if (/[aeiouáéó]$/.test(f)) all.add(f + "s");
      else if (/[lrndz]$/.test(f)) all.add((f.endsWith("z") ? f.slice(0, -1) + "c" : f) + "es");
    }
    for (const f of all) if (f && !map.has(f)) map.set(f, it.id);
    // multi-word lemmas like "por favor" are matched by matchVocab directly
  }
  return map;
}

/** Find vocab ids that occur in a text. Supports multi-word lemmas. */
export function matchVocab(text: string, items: VocabForms[], index = buildFormIndex(items)): string[] {
  const found = new Set<string>();
  const ws = words(text);
  for (const w of ws) {
    const id = index.get(w);
    if (id) found.add(id);
  }
  const norm = " " + ws.join(" ") + " ";
  // Word-spaced Japanese (our content) matched whole words above. Free text (what learners type)
  // has no word boundaries, so match known forms as substrings there.
  const spaced = /\S\s+\S/.test(text.trim());
  const ja = isJapaneseText(text) && !spaced ? text.replace(/\s+/g, "") : null;
  for (const it of items) {
    if (ja && isJapaneseText(it.lemma)) {
      if ([it.lemma, ...it.forms].some((f) => f.length >= 2 && ja.includes(f))) found.add(it.id);
      continue;
    }
    if (it.lemma.includes(" ") && norm.includes(" " + cleanPhrase(it.lemma) + " ")) found.add(it.id);
  }
  return [...found];
}

function cleanPhrase(s: string) {
  return s.split(/\s+/).map(cleanWord).join(" ");
}
