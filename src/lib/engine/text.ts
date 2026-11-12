/** Text utilities for Spanish tokenization and lenient answer comparison. Pure functions. */

/** Lowercase, strip accents and punctuation. "¿Dónde?" -> "donde" */
export function normalize(s: string): string {
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
}

/** Split a sentence into word and non-word tokens, preserving the original text exactly. */
export function tokenize(sentence: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu;
  let last = 0;
  for (const m of sentence.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) tokens.push({ text: sentence.slice(last, i), word: false });
    tokens.push({ text: m[0], word: true });
    last = i + m[0].length;
  }
  if (last < sentence.length) tokens.push({ text: sentence.slice(last), word: false });
  return tokens;
}

export function words(sentence: string): string[] {
  return tokenize(sentence)
    .filter((t) => t.word)
    .map((t) => cleanWord(t.text));
}

/** Split text into sentences, keeping terminal punctuation. */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) ?? [])
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
  for (const it of items) {
    if (it.lemma.includes(" ") && norm.includes(" " + cleanPhrase(it.lemma) + " ")) found.add(it.id);
  }
  return [...found];
}

function cleanPhrase(s: string) {
  return s.split(/\s+/).map(cleanWord).join(" ");
}
