/**
 * Game construction and answer validation.
 *
 * Games are full immersion: no translations. Meaning comes from pictures, audio and context
 * (comprehensible input), and the scaffolding fades as difficulty rises — audio plays by itself,
 * then only on tap, then not at all; word-order puzzles gain decoy words. Games are data-only templates rendered by fixed
 * React components; the secret `answer` never leaves the server.
 */
import { answersMatch, cleanWord } from "./text";
import { overall, type Skill } from "./mastery";
import type { UserWordState } from "./recommend";
import type { TargetLang } from "../lang";

export const GAME_TYPES = ["picture_choice", "drag_drop", "audio_match", "sentence_builder", "fill_blank", "memory_match", "story_challenge", "pitch_accent"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const GAME_SKILL: Record<GameType, Skill> = {
  picture_choice: "recognition",
  drag_drop: "recognition",
  audio_match: "listening",
  sentence_builder: "production",
  fill_blank: "production",
  memory_match: "recognition",
  story_challenge: "listening",
  pitch_accent: "listening",
};

/** How much an answer of each type counts toward mastery (free production counts most). */
export const GAME_WEIGHT: Record<GameType, number> = {
  picture_choice: 0.7,
  drag_drop: 0.7,
  audio_match: 0.8,
  sentence_builder: 1,
  fill_blank: 1,
  memory_match: 0.6,
  story_challenge: 0.5,
  // Pitch accent is a pronunciation skill: missing it shouldn't sink a word you otherwise know.
  pitch_accent: 0.3,
};

export interface VocabEntry {
  id: string;
  lemma: string;
  translation: string;
  emoji: string | null;
  article: string | null;
  pos: string;
  example: string | null;
  exampleTranslation: string | null;
  /** Japanese: kana reading of the lemma / of the (word-spaced) example */
  reading?: string | null;
  exampleReading?: string | null;
  /** inflected forms (used to find the word in its example) */
  forms?: string[];
  /** Japanese: Tokyo pitch accent (downstep mora; 0 = heiban/flat) */
  accent?: number | null;
}

// ---------------------------------------------------------------- Japanese pitch accent
const SMALL_KANA = /[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]/;
/** Split kana into morae: きょう → [きょ, う], がっこう → [が, っ, こ, う]. */
export function morae(kana: string): string[] {
  const out: string[] = [];
  for (const ch of kana.replace(/\s+/g, "")) {
    if (SMALL_KANA.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
/**
 * High/low pitch per mora for a word with `n` morae and downstep `accent`, plus a following
 * particle (が) — needed to tell heiban (particle stays high) from odaka (particle drops).
 * 1 = high, 0 = low.
 */
export function pitchPattern(n: number, accent: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (accent === 1) out.push(i === 0 ? 1 : 0);
    else if (accent === 0) out.push(i === 0 ? 0 : 1);
    else out.push(i === 0 ? 0 : i < accent ? 1 : 0);
  }
  if (n === 1 && accent === 0) out[0] = 0;
  out.push(accent === 0 ? 1 : 0); // particle
  return out;
}
export const ACCENT_NAME = (n: number, a: number) => (a === 0 ? "heiban" : a === 1 ? "atamadaka" : a === n ? "odaka" : "nakadaka");

/** Target-language game instructions. Japanese lines are word-spaced with a kana reading. */
const INSTR: Record<TargetLang, Record<string, [string, string?]>> = {
  es: {
    tap: ["Toca {w}"],
    listen: ["Escucha y elige la imagen"],
    basket: ["Pon {w} en la cesta"],
    basketLabel: ["la cesta"],
    order: ["Ordena las palabras"],
    complete: ["Completa la frase"],
    pairs: ["Encuentra las parejas"],
    story: ["¿Qué apareció en el video?"],
    pitch: [""],
    pitchPair: [""],
  },
  ja: {
    tap: ["「 {w} 」 は どれ ？", "「 {r} 」 は どれ ？"],
    listen: ["聞いて 、 絵 を 選んで ください 。", "きいて 、 え を えらんで ください 。"],
    basket: ["{w} を かご に 入れて ください 。", "{r} を かご に いれて ください 。"],
    basketLabel: ["かご", "かご"],
    order: ["正しい 順番 に 並べて ください 。", "ただしい じゅんばん に ならべて ください 。"],
    complete: ["文 を 完成させて ください 。", "ぶん を かんせいさせて ください 。"],
    pairs: ["ペア を 見つけて ください 。", "ペア を みつけて ください 。"],
    story: ["ビデオ に 出てきた の は どれ ？", "ビデオ に でてきた の は どれ ？"],
    pitch: ["正しい アクセント は どれ ？", "ただしい アクセント は どれ ？"],
    pitchPair: ["この 「 {r} 」 は どっち ？", "この 「 {r} 」 は どっち ？"],
  },
};

function instr(lang: TargetLang, key: string, v?: VocabEntry) {
  const [text, reading] = INSTR[lang][key];
  const w = v ? (lang === "es" ? withArticle(v) : v.lemma) : "";
  const r = v ? (v.reading ?? v.lemma) : "";
  return { text: text.replace("{w}", w), reading: reading?.replace("{r}", r) };
}

const PUNCT_CHUNK = /^[^\p{L}\p{N}]+$/u;
/** Word chunks of a word-spaced Japanese sentence, punctuation removed. */
function jaChunks(sentence: string): string[] {
  return sentence.trim().split(/\s+/).map((c) => c.replace(/[^\p{L}\p{N}ー]/gu, "")).filter((c) => c && !PUNCT_CHUNK.test(c));
}

/** How much audio support a game gives: plays by itself, on tap only, or none. */
export type AudioSupport = "auto" | "tap" | "none";
export const audioSupport = (difficulty: number): AudioSupport => (difficulty <= 2 ? "auto" : difficulty === 3 ? "tap" : "none");
/** Decoy tiles in word-order puzzles. */
export const decoyCount = (difficulty: number) => (difficulty <= 2 ? 0 : difficulty === 3 ? 1 : 2);

export type GamePayload =
  | { type: "picture_choice"; instruction: string; instructionReading?: string; options: { id: string; emoji: string; label: string }[] }
  | { type: "drag_drop"; instruction: string; instructionReading?: string; target: { emoji: string; label: string }; items: { id: string; emoji: string; label: string }[] }
  | { type: "audio_match"; instruction: string; instructionReading?: string; speak: string; options: { id: string; emoji: string; label: string }[] }
  | { type: "sentence_builder"; instruction: string; instructionReading?: string; emoji?: string; speak?: string; audio: AudioSupport; tokens: { id: string; text: string; sub?: string }[] }
  | { type: "fill_blank"; instruction: string; instructionReading?: string; emoji?: string; speak?: string; audio: AudioSupport; before: string; after: string; beforeReading?: string; afterReading?: string; options: string[] }
  | { type: "memory_match"; instruction: string; instructionReading?: string; cards: { id: string; face: string; sub?: string; kind: "word" | "picture" }[] }
  | { type: "story_challenge"; instruction: string; instructionReading?: string; contentTitle: string; options: string[] }
  /** "pattern": pick the pitch contour of a word. "pair": hear/see the contour, pick which homophone it is. */
  | { type: "pitch_accent"; mode: "pattern"; instruction: string; instructionReading?: string; word: string; reading: string; morae: string[]; speak?: string; audio: AudioSupport; options: number[][] }
  | { type: "pitch_accent"; mode: "pair"; instruction: string; instructionReading?: string; reading: string; morae: string[]; contour: number[]; speak?: string; audio: AudioSupport; options: { id: string; emoji: string }[] };

export type GameAnswer =
  | { type: "picture_choice" | "drag_drop" | "audio_match"; optionId: string }
  | { type: "sentence_builder"; sentence: string }
  | { type: "fill_blank"; word: string }
  | { type: "memory_match"; pairs: Record<string, string> }
  | { type: "story_challenge" | "pitch_accent"; index: number };

export type GameResponse =
  | { optionId: string }
  | { tokenIds: string[] }
  | { word: string }
  | { pairs: [string, string][] }
  | { index: number };

export interface BuiltGame {
  type: GameType;
  payload: GamePayload;
  answer: GameAnswer;
  /** vocab assessed by this game; the first is the focus word */
  vocabIds: string[];
}

// ---------- seeded RNG ----------
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- choosing what to practice ----------

/**
 * Pick focus words: due reviews first, then words with recent mistakes / low mastery for the
 * target skill, then at most `maxNew` brand-new words.
 */
export function pickFocusWords(
  pool: VocabEntry[],
  userWords: Map<string, UserWordState>,
  n: number,
  now: Date,
  skill: Skill = "recognition",
  maxNew = 1,
): VocabEntry[] {
  const due: [VocabEntry, number][] = [];
  const weak: [VocabEntry, number][] = [];
  const fresh: VocabEntry[] = [];
  for (const v of pool) {
    const w = userWords.get(v.id);
    if (!w || (w.exposures === 0 && overall(w.skills) === 0)) {
      fresh.push(v);
      continue;
    }
    if (w.dueAt && w.dueAt.getTime() <= now.getTime()) due.push([v, w.dueAt.getTime()]);
    else weak.push([v, w.skills[skill] - w.incorrectCount * 0.05]);
  }
  due.sort((a, b) => a[1] - b[1] || a[0].id.localeCompare(b[0].id));
  weak.sort((a, b) => a[1] - b[1] || a[0].id.localeCompare(b[0].id));
  const out: VocabEntry[] = [];
  for (const [v] of due) if (out.length < n) out.push(v);
  let newUsed = 0;
  // Interleave: once reviews are exhausted, prefer weak seen words but allow a little new material.
  const weakList = weak.map(([v]) => v);
  while (out.length < n && (weakList.length || (fresh.length && newUsed < maxNew))) {
    if (fresh.length && newUsed < maxNew && (out.length > 0 || weakList.length === 0)) {
      out.push(fresh.shift()!);
      newUsed++;
    } else if (weakList.length) out.push(weakList.shift()!);
    else break;
  }
  for (const v of fresh) if (out.length < n) out.push(v);
  return out;
}

/** Can this word be the focus of this game type? */
export function supportsType(type: GameType, v: VocabEntry): boolean {
  switch (type) {
    case "picture_choice":
    case "drag_drop":
    case "audio_match":
    case "memory_match":
      return !!v.emoji && v.pos === "noun";
    case "sentence_builder": {
      if (!v.example) return false;
      const n = v.reading !== undefined && v.reading !== null ? jaChunks(v.example).length : v.example.split(/\s+/).length;
      return n >= 3 && n <= 10;
    }
    case "fill_blank":
      return !!v.example && findSurface(v.example, v) !== null;
    case "story_challenge":
      return false;
    case "pitch_accent":
      return v.accent != null && !!v.reading;
  }
}

export function gameTypesFor(difficulty: number): GameType[] {
  if (difficulty <= 1) return ["picture_choice", "drag_drop", "audio_match", "memory_match"];
  if (difficulty === 2) return ["picture_choice", "audio_match", "memory_match", "drag_drop", "fill_blank", "sentence_builder"];
  if (difficulty === 3) return ["audio_match", "fill_blank", "sentence_builder", "memory_match"];
  return ["fill_blank", "sentence_builder", "audio_match"];
}

export function optionCount(difficulty: number) {
  return Math.min(6, 2 + difficulty);
}

const withArticle = (v: VocabEntry) => (v.article ? `${v.article} ${v.lemma}` : v.lemma);

/** Build one game. Returns null if the pool can't support this type for the focus word. */
export function buildGame(type: GameType, focus: VocabEntry, pool: VocabEntry[], difficulty: number, rand: () => number, lang: TargetLang = "es"): BuiltGame | null {
  const k = optionCount(difficulty);
  const ja = lang === "ja";
  const audio = audioSupport(difficulty);
  // Audio (when offered) is the whole example sentence: hear it, then rebuild / complete it.
  const sentenceAudio = audio === "none" || !focus.example ? {} : { speak: focus.example };
  // Picture clue for a sentence: the focus word's picture plus pictures of other words in it
  // (a verb has no picture, but 彼女 は 水 を 飲みます still shows 💧).
  const pics = focus.example
    ? [focus.emoji, ...pool.filter((v) => v.id !== focus.id && v.emoji && v.pos === "noun" && findSurface(focus.example!, v)).map((v) => v.emoji)].filter(Boolean)
    : [focus.emoji].filter(Boolean);
  const pictureClue = pics.length ? { emoji: [...new Set(pics)].slice(0, 3).join("") } : {};
  /** Decoy tiles: words from other examples that aren't in this sentence. */
  const decoys = (words: string[], split: (s: string) => string[]) => {
    const n = decoyCount(difficulty);
    if (!n) return [];
    const have = new Set(words);
    const cands = [...new Set(pool.filter((v) => v.id !== focus.id && v.example).flatMap((v) => split(v.example!)))].filter((w) => !have.has(w) && w.length > 0);
    return shuffle(cands, rand).slice(0, n);
  };
  const distractors = (filter: (v: VocabEntry) => boolean, count: number) =>
    shuffle(
      pool.filter((v) => v.id !== focus.id && filter(v)),
      rand,
    ).slice(0, count);

  switch (type) {
    case "picture_choice":
    case "audio_match": {
      if (!focus.emoji || focus.pos !== "noun") return null;
      const opts = shuffle([focus, ...distractors((v) => !!v.emoji && v.pos === "noun" && v.emoji !== focus.emoji, k - 1)], rand);
      if (opts.length < 2) return null;
      const options = opts.map((v) => ({ id: v.id, emoji: v.emoji!, label: "" }));
      if (type === "picture_choice") {
        const i = instr(lang, "tap", focus);
        return {
          type,
          payload: { type, instruction: i.text, instructionReading: i.reading, options },
          answer: { type, optionId: focus.id },
          vocabIds: [focus.id, ...opts.filter((o) => o.id !== focus.id).map((o) => o.id)],
        };
      }
      return {
        type,
        payload: { type, instruction: instr(lang, "listen").text, instructionReading: instr(lang, "listen").reading, speak: ja ? focus.lemma : withArticle(focus), options },
        answer: { type, optionId: focus.id },
        vocabIds: [focus.id],
      };
    }
    case "drag_drop": {
      if (!focus.emoji || focus.pos !== "noun") return null;
      const items = shuffle([focus, ...distractors((v) => !!v.emoji && v.pos === "noun" && v.emoji !== focus.emoji, Math.min(4, k - 1))], rand);
      return {
        type,
        payload: {
          type,
          instruction: instr(lang, "basket", focus).text,
          instructionReading: instr(lang, "basket", focus).reading,
          target: { emoji: "🧺", label: instr(lang, "basketLabel").text },
          items: items.map((v) => ({ id: v.id, emoji: v.emoji!, label: "" })),
        },
        answer: { type, optionId: focus.id },
        vocabIds: [focus.id, ...items.filter((v) => v.id !== focus.id).map((v) => v.id)],
      };
    }
    case "sentence_builder": {
      if (!focus.example) return null;
      if (ja) {
        const ws = jaChunks(focus.example);
        const rs = focus.exampleReading ? jaChunks(focus.exampleReading) : [];
        if (ws.length < 3 || ws.length > 10) return null;
        let tokens: { id: string; text: string; sub?: string }[] = ws.map((t, i) => ({ id: `t${i}`, text: t, ...(rs.length === ws.length ? { sub: rs[i] } : {}) }));
        // Decoys carry their own reading when the source example had aligned readings.
        const decoyReading = new Map<string, string>();
        for (const v of pool) {
          if (!v.example || !v.exampleReading) continue;
          const a = jaChunks(v.example);
          const b = jaChunks(v.exampleReading);
          if (a.length === b.length) a.forEach((w, j) => decoyReading.set(w, b[j]));
        }
        tokens.push(...decoys(ws, jaChunks).map((d, j) => ({ id: `d${j}`, text: d, ...(decoyReading.has(d) ? { sub: decoyReading.get(d)! } : {}) })));
        for (let i = 0; i < 5; i++) {
          tokens = shuffle(tokens, rand);
          if (tokens.map((t) => t.text).join("") !== ws.join("")) break;
        }
        const i = instr(lang, "order");
        return {
          type,
          payload: { type, instruction: i.text, instructionReading: i.reading, ...pictureClue, ...sentenceAudio, audio, tokens },
          answer: { type, sentence: ws.join("") },
          vocabIds: [focus.id],
        };
      }
      const ws = focus.example.replace(/[¿¡]/g, "").replace(/[.!?,]/g, "").split(/\s+/).filter(Boolean);
      if (ws.length < 3 || ws.length > 10) return null;
      const words = (s: string) => s.replace(/[¿¡]/g, "").replace(/[.!?,]/g, "").split(/\s+/).filter(Boolean);
      let tokens = [...ws.map((t, i) => ({ id: `t${i}`, text: t })), ...decoys(ws, words).map((d, j) => ({ id: `d${j}`, text: d }))];
      for (let i = 0; i < 5; i++) {
        tokens = shuffle(tokens, rand);
        if (tokens.map((t) => t.text).join(" ") !== ws.join(" ")) break;
      }
      return {
        type,
        payload: { type, instruction: instr(lang, "order").text, ...pictureClue, ...sentenceAudio, audio, tokens },
        answer: { type, sentence: ws.join(" ") },
        vocabIds: [focus.id],
      };
    }
    case "fill_blank": {
      if (!focus.example) return null;
      const surface = findSurface(focus.example, focus);
      if (!surface) return null;
      const idx = focus.example.indexOf(surface);
      // Japanese distractors use a form with the same ending (食べます → 飲みます), not the dictionary form.
      // Longest shared ending wins (食べました → 読みました over さがした).
      const endings = ja ? [surface.slice(-3), surface.slice(-2)].filter((e) => e.length && e !== surface) : [];
      const formsOf = (v: VocabEntry) => [v.lemma, ...(v.forms ?? [])];
      const want = Math.min(3, k - 1);
      const cands = (e: string) => pool.filter((v) => v.pos === focus.pos && v.lemma !== focus.lemma && formsOf(v).some((x) => x.endsWith(e))).length;
      const ending = endings.find((e) => cands(e) >= want) ?? endings[endings.length - 1];
      const sameForm = (v: VocabEntry) => (ending ? formsOf(v).find((x) => x.endsWith(ending)) ?? null : null);
      const asOption = (v: VocabEntry) => (ja ? (sameForm(v) ?? v.lemma) : v.lemma);
      const opts = shuffle([surface, ...distractors((v) => v.pos === focus.pos && v.lemma !== surface && (!ja || !!sameForm(v)), Math.min(3, k - 1)).map(asOption).filter((o) => o !== surface)], rand);
      if (opts.length < 2) return null;
      let beforeReading: string | undefined;
      let afterReading: string | undefined;
      if (ja && focus.exampleReading) {
        const tc = focus.example.trim().split(/\s+/);
        const rc = focus.exampleReading.trim().split(/\s+/);
        const at = tc.findIndex((c) => c.includes(surface));
        if (tc.length === rc.length && at >= 0) {
          beforeReading = rc.slice(0, at).join(" ");
          afterReading = rc.slice(at + 1).join(" ");
        }
      }
      const i = instr(lang, "complete");
      return {
        type,
        payload: {
          type,
          instruction: i.text,
          instructionReading: i.reading,
          before: focus.example.slice(0, idx),
          after: focus.example.slice(idx + surface.length),
          ...(beforeReading !== undefined ? { beforeReading, afterReading } : {}),
          ...pictureClue,
          ...sentenceAudio,
          audio,
          options: opts,
        },
        answer: { type, word: surface },
        vocabIds: [focus.id],
      };
    }
    case "story_challenge":
      return null; // built from watched content via buildStoryChallenge
    case "pitch_accent": {
      if (!ja || focus.accent == null || !focus.reading) return null;
      const m = morae(focus.reading);
      const speak = audio === "none" ? {} : { speak: focus.lemma };
      // Minimal pair (箸 / 橋, 雨 / 飴): same sound, different pitch — pick the picture.
      const twin = pool.find((v) => v.id !== focus.id && v.reading === focus.reading && v.accent != null && v.accent !== focus.accent && v.emoji);
      if (twin && focus.emoji && difficulty >= 2) {
        const i = instr(lang, "pitchPair", focus);
        const options = shuffle([{ id: focus.id, emoji: focus.emoji }, { id: twin.id, emoji: twin.emoji! }], rand);
        return {
          type,
          payload: { type, mode: "pair", instruction: i.text, instructionReading: i.reading, reading: focus.reading, morae: m, contour: pitchPattern(m.length, focus.accent), ...speak, audio, options },
          answer: { type, index: options.findIndex((o) => o.id === focus.id) },
          vocabIds: [focus.id, twin.id],
        };
      }
      // Pick the contour. More (and more similar) choices as difficulty rises.
      const all = Array.from({ length: m.length + 1 }, (_, a) => a).filter((a) => a !== focus.accent);
      const n = Math.min(all.length, difficulty <= 1 ? 1 : difficulty <= 3 ? 2 : 3);
      const accents = shuffle([focus.accent, ...shuffle(all, rand).slice(0, n)], rand);
      const i = instr(lang, "pitch");
      return {
        type,
        payload: { type, mode: "pattern", instruction: i.text, instructionReading: i.reading, word: focus.lemma, reading: focus.reading, morae: m, ...speak, audio, options: accents.map((a) => pitchPattern(m.length, a)) },
        answer: { type, index: accents.indexOf(focus.accent) },
        vocabIds: [focus.id],
      };
    }
    case "memory_match": {
      const set = [focus, ...distractors((v) => !!v.emoji && v.pos === "noun" && v.emoji !== focus.emoji, Math.min(5, 2 + difficulty))].filter((v) => v.emoji);
      if (set.length < 3 || !focus.emoji) return null;
      const cards: { id: string; face: string; kind: "word" | "picture" }[] = [];
      const pairs: Record<string, string> = {};
      set.forEach((v, i) => {
        const w = `w${i}${Math.floor(rand() * 1e6).toString(36)}`;
        const p = `p${i}${Math.floor(rand() * 1e6).toString(36)}`;
        cards.push({ id: w, face: v.lemma, ...(ja && v.reading && v.reading !== v.lemma ? { sub: v.reading } : {}), kind: "word" }, { id: p, face: v.emoji!, kind: "picture" });
        pairs[w] = p;
        pairs[p] = w;
      });
      return {
        type,
        payload: { type, instruction: instr(lang, "pairs").text, instructionReading: instr(lang, "pairs").reading, cards: shuffle(cards, rand) },
        answer: { type, pairs },
        vocabIds: set.map((v) => v.id),
      };
    }
  }
}

/**
 * "Story challenge": which picture appeared in a video the learner watched? Answered from memory
 * of the video itself — no translated question. `seen` = scene emoji from that video,
 * `unseen` = scene emoji from other videos.
 */
export function buildStoryChallenge(contentTitle: string, seen: string[], unseen: string[], vocabIds: string[], rand: () => number, lang: TargetLang = "es", difficulty = 2): BuiltGame | null {
  const correct = shuffle(seen, rand)[0];
  const seenSet = new Set(seen);
  const others = shuffle([...new Set(unseen)].filter((e) => !seenSet.has(e)), rand).slice(0, Math.max(2, optionCount(difficulty) - 1));
  if (!correct || others.length < 2) return null;
  const options = shuffle([correct, ...others], rand);
  const i = instr(lang, "story");
  return {
    type: "story_challenge",
    payload: { type: "story_challenge", instruction: i.text, instructionReading: i.reading, contentTitle, options },
    answer: { type: "story_challenge", index: options.indexOf(correct) },
    vocabIds,
  };
}

/** Find how the focus word appears in its example sentence (e.g. "naranjas"). */
export function findSurface(example: string, v: Pick<VocabEntry, "lemma"> & { forms?: string[] }): string | null {
  // Word-spaced Japanese: the chunk that is the lemma or one of its forms.
  if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(v.lemma)) {
    const forms = [v.lemma, ...(v.forms ?? [])].sort((a, b) => b.length - a.length);
    for (const c of jaChunks(example)) if (forms.includes(c)) return c;
    return null;
  }
  const target = cleanWord(v.lemma);
  if (v.lemma.includes(" ")) return example.toLowerCase().includes(v.lemma.toLowerCase()) ? example.slice(example.toLowerCase().indexOf(v.lemma.toLowerCase()), example.toLowerCase().indexOf(v.lemma.toLowerCase()) + v.lemma.length) : null;
  const m = example.match(/[\p{L}]+/gu) ?? [];
  for (const w of m) {
    const c = cleanWord(w);
    if (c === target || c === target + "s" || c === target + "es") return w;
  }
  // verb stems: "comer" -> "come", "comemos"
  if (target.length > 4 && /(ar|er|ir)$/.test(target)) {
    const stem = target.slice(0, -2);
    for (const w of m) if (cleanWord(w).startsWith(stem)) return w;
  }
  return null;
}

/** Build a game using the first type in `types` that works for one of the focus words. */
export function buildFirstPossible(types: GameType[], focus: VocabEntry[], pool: VocabEntry[], difficulty: number, rand: () => number, lang: TargetLang = "es"): BuiltGame | null {
  for (const t of types) for (const f of focus) {
    const g = buildGame(t, f, pool, difficulty, rand, lang);
    if (g) return g;
  }
  return null;
}

export interface Validation {
  correct: boolean;
  /** what to show the learner after answering */
  expected: string | Record<string, string>;
  /** per-vocab correctness for mastery updates */
  perVocab: { vocabId: string; correct: boolean }[];
}

export function validate(game: Pick<BuiltGame, "type" | "payload" | "answer" | "vocabIds">, response: GameResponse): Validation {
  const a = game.answer;
  const focusId = game.vocabIds[0];
  switch (a.type) {
    case "picture_choice":
    case "drag_drop":
    case "audio_match": {
      const r = response as { optionId?: string };
      const correct = r.optionId === a.optionId;
      const perVocab = [{ vocabId: a.optionId, correct }];
      return { correct, expected: a.optionId, perVocab };
    }
    case "sentence_builder": {
      const r = response as { tokenIds?: string[] };
      const p = game.payload as Extract<GamePayload, { type: "sentence_builder" }>;
      const byId = new Map(p.tokens.map((t) => [t.id, t.text]));
      const built = (r.tokenIds ?? []).map((id) => byId.get(id) ?? "").join(" ");
      // Decoy tiles must be left out; the built sentence has to match exactly.
      const correct = answersMatch(built, a.sentence);
      return { correct, expected: a.sentence, perVocab: [{ vocabId: focusId, correct }] };
    }
    case "fill_blank": {
      const r = response as { word?: string };
      const correct = answersMatch(r.word ?? "", a.word);
      return { correct, expected: a.word, perVocab: [{ vocabId: focusId, correct }] };
    }
    case "story_challenge":
    case "pitch_accent": {
      const r = response as { index?: number };
      const correct = r.index === a.index;
      return { correct, expected: String(a.index), perVocab: game.vocabIds.slice(0, 3).map((vocabId) => ({ vocabId, correct })) };
    }
    case "memory_match": {
      const r = response as { pairs?: [string, string][] };
      const pairs = r.pairs ?? [];
      const needed = Object.keys(a.pairs).length / 2;
      const ok = pairs.filter(([x, y]) => a.pairs[x] === y);
      const correct = ok.length === needed && pairs.length === needed;
      return { correct, expected: a.pairs, perVocab: game.vocabIds.map((vocabId) => ({ vocabId, correct })) };
    }
  }
}

/** For memory games: check one flipped pair without finishing the game. */
export function checkPair(answer: GameAnswer, x: string, y: string): boolean {
  return answer.type === "memory_match" && answer.pairs[x] === y;
}
