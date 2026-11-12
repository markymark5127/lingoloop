/**
 * Game construction and answer validation. Games are data-only templates rendered by fixed
 * React components; the secret `answer` never leaves the server.
 */
import { answersMatch, cleanWord } from "./text";
import { overall, type Skill } from "./mastery";
import type { UserWordState } from "./recommend";

export const GAME_TYPES = ["picture_choice", "drag_drop", "audio_match", "sentence_builder", "fill_blank", "memory_match", "story_challenge"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const GAME_SKILL: Record<GameType, Skill> = {
  picture_choice: "recognition",
  drag_drop: "recognition",
  audio_match: "listening",
  sentence_builder: "production",
  fill_blank: "production",
  memory_match: "recognition",
  story_challenge: "listening",
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
}

export type GamePayload =
  | { type: "picture_choice"; instruction: string; instructionTranslation: string; options: { id: string; emoji: string; label: string }[] }
  | { type: "drag_drop"; instruction: string; instructionTranslation: string; target: { emoji: string; label: string }; items: { id: string; emoji: string; label: string }[] }
  | { type: "audio_match"; instruction: string; speak: string; options: { id: string; emoji: string; label: string }[] }
  | { type: "sentence_builder"; instruction: string; translation: string; tokens: { id: string; text: string }[] }
  | { type: "fill_blank"; instruction: string; before: string; after: string; translation: string; options: string[] }
  | { type: "memory_match"; instruction: string; cards: { id: string; face: string; kind: "word" | "picture" }[] }
  | { type: "story_challenge"; instruction: string; contentTitle: string; question: string; options: string[] };

export type GameAnswer =
  | { type: "picture_choice" | "drag_drop" | "audio_match"; optionId: string }
  | { type: "sentence_builder"; sentence: string }
  | { type: "fill_blank"; word: string }
  | { type: "memory_match"; pairs: Record<string, string> }
  | { type: "story_challenge"; index: number };

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
    case "sentence_builder":
      return !!v.example && v.example.split(/\s+/).length >= 3 && v.example.split(/\s+/).length <= 10;
    case "fill_blank":
      return !!v.example && findSurface(v.example, v) !== null;
    case "story_challenge":
      return false;
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
export function buildGame(type: GameType, focus: VocabEntry, pool: VocabEntry[], difficulty: number, rand: () => number): BuiltGame | null {
  const k = optionCount(difficulty);
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
        return {
          type,
          payload: { type, instruction: `Toca ${withArticle(focus)}`, instructionTranslation: `Tap the ${focus.translation}`, options },
          answer: { type, optionId: focus.id },
          vocabIds: [focus.id, ...opts.filter((o) => o.id !== focus.id).map((o) => o.id)],
        };
      }
      return {
        type,
        payload: { type, instruction: "Escucha y elige la imagen", speak: withArticle(focus), options },
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
          instruction: `Pon ${withArticle(focus)} en la cesta`,
          instructionTranslation: `Put the ${focus.translation} in the basket`,
          target: { emoji: "🧺", label: "la cesta" },
          items: items.map((v) => ({ id: v.id, emoji: v.emoji!, label: "" })),
        },
        answer: { type, optionId: focus.id },
        vocabIds: [focus.id, ...items.filter((v) => v.id !== focus.id).map((v) => v.id)],
      };
    }
    case "sentence_builder": {
      if (!focus.example) return null;
      const ws = focus.example.replace(/[¿¡]/g, "").replace(/[.!?,]/g, "").split(/\s+/).filter(Boolean);
      if (ws.length < 3 || ws.length > 10) return null;
      let tokens = ws.map((t, i) => ({ id: `t${i}`, text: t }));
      for (let i = 0; i < 5; i++) {
        tokens = shuffle(tokens, rand);
        if (tokens.map((t) => t.text).join(" ") !== ws.join(" ")) break;
      }
      return {
        type,
        payload: { type, instruction: "Ordena las palabras", translation: focus.exampleTranslation ?? "", tokens },
        answer: { type, sentence: ws.join(" ") },
        vocabIds: [focus.id],
      };
    }
    case "fill_blank": {
      if (!focus.example) return null;
      const surface = findSurface(focus.example, focus);
      if (!surface) return null;
      const idx = focus.example.indexOf(surface);
      const opts = shuffle([surface, ...distractors((v) => v.pos === focus.pos && v.lemma !== surface, Math.min(3, k - 1)).map((v) => v.lemma)], rand);
      if (opts.length < 2) return null;
      return {
        type,
        payload: {
          type,
          instruction: "Completa la frase",
          before: focus.example.slice(0, idx),
          after: focus.example.slice(idx + surface.length),
          translation: focus.exampleTranslation ?? "",
          options: opts,
        },
        answer: { type, word: surface },
        vocabIds: [focus.id],
      };
    }
    case "story_challenge":
      return null; // built from watched content via buildStoryChallenge
    case "memory_match": {
      const set = [focus, ...distractors((v) => !!v.emoji && v.pos === "noun" && v.emoji !== focus.emoji, Math.min(5, 2 + difficulty))].filter((v) => v.emoji);
      if (set.length < 3 || !focus.emoji) return null;
      const cards: { id: string; face: string; kind: "word" | "picture" }[] = [];
      const pairs: Record<string, string> = {};
      set.forEach((v, i) => {
        const w = `w${i}${Math.floor(rand() * 1e6).toString(36)}`;
        const p = `p${i}${Math.floor(rand() * 1e6).toString(36)}`;
        cards.push({ id: w, face: v.lemma, kind: "word" }, { id: p, face: v.emoji!, kind: "picture" });
        pairs[w] = p;
        pairs[p] = w;
      });
      return {
        type,
        payload: { type, instruction: "Encuentra las parejas", cards: shuffle(cards, rand) },
        answer: { type, pairs },
        vocabIds: set.map((v) => v.id),
      };
    }
  }
}

/** "Story challenge": a comprehension question about a video the learner already watched. */
export function buildStoryChallenge(
  contentTitle: string,
  question: { q: string; options: string[]; answer: number },
  vocabIds: string[],
  rand: () => number,
): BuiltGame {
  const order = shuffle(question.options.map((_, i) => i), rand);
  return {
    type: "story_challenge",
    payload: { type: "story_challenge", instruction: "¿Qué pasó en el video?", contentTitle, question: question.q, options: order.map((i) => question.options[i]) },
    answer: { type: "story_challenge", index: order.indexOf(question.answer) },
    vocabIds,
  };
}

/** Find how the focus word appears in its example sentence (e.g. "naranjas"). */
export function findSurface(example: string, v: Pick<VocabEntry, "lemma">): string | null {
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
export function buildFirstPossible(types: GameType[], focus: VocabEntry[], pool: VocabEntry[], difficulty: number, rand: () => number): BuiltGame | null {
  for (const t of types) for (const f of focus) {
    const g = buildGame(t, f, pool, difficulty, rand);
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
      const correct = answersMatch(built, a.sentence) && (r.tokenIds ?? []).length === p.tokens.length;
      return { correct, expected: a.sentence, perVocab: [{ vocabId: focusId, correct }] };
    }
    case "fill_blank": {
      const r = response as { word?: string };
      const correct = answersMatch(r.word ?? "", a.word);
      return { correct, expected: a.word, perVocab: [{ vocabId: focusId, correct }] };
    }
    case "story_challenge": {
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
