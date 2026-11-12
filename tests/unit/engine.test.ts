import { describe, expect, it } from "vitest";
import {
  EMPTY_SKILLS,
  EXPOSURE_CAP,
  applyAnswer,
  applyExposure,
  label,
  review,
  initialSrs,
  qualityFromAnswer,
  suggestLevel,
  difficultyFor,
  rankContent,
  scoreContent,
  bucketFor,
  buildGame,
  validate,
  pickFocusWords,
  rng,
  checkPair,
  tokenize,
  matchVocab,
  answersMatch,
  sentences,
  findSurface,
  type UserWordState,
  type VocabEntry,
  type ContentCandidate,
} from "@/lib/engine";

const now = new Date("2026-11-11T12:00:00Z");

describe("text", () => {
  it("tokenizes preserving punctuation", () => {
    const t = tokenize("¿Dónde está la naranja?");
    expect(t.map((x) => x.text).join("")).toBe("¿Dónde está la naranja?");
    expect(t.filter((x) => x.word).map((x) => x.text)).toEqual(["Dónde", "está", "la", "naranja"]);
  });
  it("compares answers leniently", () => {
    expect(answersMatch("¿Dónde está?", "donde esta")).toBe(true);
    expect(answersMatch("gato", "perro")).toBe(false);
  });
  it("splits sentences", () => {
    expect(sentences("Hola. ¿Qué tal? ¡Muy bien!")).toEqual(["Hola.", "¿Qué tal?", "¡Muy bien!"]);
  });
  it("matches vocab including plurals and phrases", () => {
    const items = [
      { id: "1", lemma: "naranja", forms: [] },
      { id: "2", lemma: "por favor", forms: [] },
      { id: "3", lemma: "ser", forms: ["soy", "es"] },
    ];
    expect(matchVocab("Dos naranjas, por favor. Es tarde.", items).sort()).toEqual(["1", "2", "3"]);
  });
  it("finds surface forms", () => {
    expect(findSurface("Compro tres naranjas.", { lemma: "naranja" })).toBe("naranjas");
    expect(findSurface("Nosotros comemos pan.", { lemma: "comer" })).toBe("comemos");
  });
});

describe("mastery", () => {
  it("passive exposure is capped so time alone cannot make a word strong", () => {
    let s = EMPTY_SKILLS;
    for (let i = 0; i < 100; i++) s = applyExposure(s);
    expect(s.recognition).toBe(EXPOSURE_CAP);
    expect(label(s.recognition)).toBe("needs-practice");
  });
  it("correct answers raise and wrong answers lower the targeted skill only", () => {
    let s = applyAnswer(EMPTY_SKILLS, "listening", true);
    expect(s.listening).toBeGreaterThan(0);
    expect(s.production).toBe(0);
    const before = s.listening;
    s = applyAnswer(s, "listening", false);
    expect(s.listening).toBeLessThan(before);
  });
  it("repeated correct answers reach strong", () => {
    let s = EMPTY_SKILLS;
    for (let i = 0; i < 5; i++) s = applyAnswer(s, "recognition", true);
    expect(label(s.recognition)).toBe("strong");
  });
});

describe("srs", () => {
  it("grows intervals on success and resets on lapse", () => {
    let s = initialSrs(now);
    s = review(s, 5, now);
    expect(s.intervalDays).toBe(1);
    s = review(s, 5, now);
    expect(s.intervalDays).toBe(3);
    s = review(s, 4, now);
    expect(s.intervalDays).toBeGreaterThan(3);
    const lapsed = review(s, 1, now);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(lapsed.ease).toBeLessThan(s.ease);
  });
  it("maps answers to quality", () => {
    expect(qualityFromAnswer(true, 2000)).toBe(5);
    expect(qualityFromAnswer(true, 9000)).toBe(4);
    expect(qualityFromAnswer(false)).toBeLessThan(3);
  });
});

describe("level", () => {
  it("does not change level without enough assessed answers (time is not an input)", () => {
    expect(suggestLevel({ current: "A1", strongWords: 500, recentAccuracy: 1, recentAnswers: 5 }).change).toBe("same");
  });
  it("promotes on accuracy + retention and eases on struggle", () => {
    expect(suggestLevel({ current: "A1", strongWords: 45, recentAccuracy: 0.9, recentAnswers: 30 }).level).toBe("A2");
    expect(suggestLevel({ current: "A1", strongWords: 10, recentAccuracy: 0.9, recentAnswers: 30 }).level).toBe("A1");
    expect(suggestLevel({ current: "B1", strongWords: 10, recentAccuracy: 0.3, recentAnswers: 30 }).level).toBe("A2");
  });
  it("adapts exercise difficulty", () => {
    expect(difficultyFor("A1", 0.95, 10)).toBe(2);
    expect(difficultyFor("A2", 0.3, 10)).toBe(1);
    expect(difficultyFor("A2", 0.3, 2)).toBe(2);
  });
});

const word = (id: string, o: Partial<UserWordState> = {}): UserWordState => ({
  vocabId: id,
  skills: { recognition: 0.9, listening: 0.9, production: 0.9 },
  dueAt: new Date(now.getTime() + 86400000 * 5),
  incorrectCount: 0,
  exposures: 3,
  ...o,
});

describe("recommendations", () => {
  const known = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8"];
  const words = new Map<string, UserWordState>(known.map((k) => [k, word(k)]));
  words.set("weak", word("weak", { skills: { recognition: 0.2, listening: 0, production: 0 }, incorrectCount: 2 }));
  const ctx = { level: "A1" as const, interests: ["mystery"], words, now, lemmaOf: (id: string) => (id === "weak" ? "naranja" : id) };

  it("buckets words", () => {
    expect(bucketFor(undefined, now)).toBe("new");
    expect(bucketFor(words.get("k1"), now)).toBe("known");
    expect(bucketFor(words.get("weak"), now)).toBe("review");
    expect(bucketFor(word("d", { dueAt: new Date(now.getTime() - 1) }), now)).toBe("review");
  });

  it("prefers content that reinforces a word the learner just got wrong", () => {
    const a: ContentCandidate = { id: "a", title: "A", genre: "comedy", cefr: "A1", vocabIds: [...known, "n1"] };
    const b: ContentCandidate = { id: "b", title: "B", genre: "comedy", cefr: "A1", vocabIds: [...known, "weak"] };
    const ranked = rankContent([a, b], ctx);
    expect(ranked[0].id).toBe("b");
    expect(ranked[0].reasons.join(" ")).toContain("naranja");
  });

  it("penalizes content with too many new words and content above level", () => {
    const easy: ContentCandidate = { id: "easy", title: "", genre: "travel", cefr: "A1", vocabIds: [...known, "n1"] };
    const flood: ContentCandidate = { id: "flood", title: "", genre: "travel", cefr: "A1", vocabIds: ["n1", "n2", "n3", "n4", "k1"] };
    const hard: ContentCandidate = { id: "hard", title: "", genre: "travel", cefr: "B2", vocabIds: [...known, "n1"] };
    const s = (c: ContentCandidate) => scoreContent(c, ctx).score;
    expect(s(easy)).toBeGreaterThan(s(flood));
    expect(s(easy)).toBeGreaterThan(s(hard));
  });

  it("boosts interests and demotes completed items", () => {
    const m: ContentCandidate = { id: "m", title: "", genre: "mystery", cefr: "A1", vocabIds: known };
    const c: ContentCandidate = { id: "c", title: "", genre: "comedy", cefr: "A1", vocabIds: known };
    expect(scoreContent(m, ctx).score).toBeGreaterThan(scoreContent(c, ctx).score);
    expect(scoreContent({ ...m, completed: true }, ctx).score).toBeLessThan(scoreContent(c, ctx).score);
  });
});

const V = (id: string, lemma: string, emoji: string | null, o: Partial<VocabEntry> = {}): VocabEntry => ({
  id,
  lemma,
  translation: lemma + "-en",
  emoji,
  article: "la",
  pos: "noun",
  example: null,
  exampleTranslation: null,
  ...o,
});
const pool: VocabEntry[] = [
  V("1", "naranja", "🍊", { example: "Me gusta la naranja.", exampleTranslation: "I like the orange." }),
  V("2", "manzana", "🍎"),
  V("3", "pera", "🍐"),
  V("4", "uva", "🍇"),
  V("5", "comer", null, { pos: "verb", article: null, example: "Nosotros comemos pan.", exampleTranslation: "We eat bread." }),
  V("6", "beber", null, { pos: "verb", article: null }),
];

describe("games", () => {
  it("picture choice validates server-side and never includes the answer in the payload", () => {
    const g = buildGame("picture_choice", pool[0], pool, 1, rng(1))!;
    expect(g.payload.type).toBe("picture_choice");
    expect(JSON.stringify(g.payload)).not.toContain('"optionId"');
    expect(validate(g, { optionId: "1" }).correct).toBe(true);
    expect(validate(g, { optionId: "2" }).correct).toBe(false);
  });
  it("sentence builder accepts the correct order only", () => {
    const g = buildGame("sentence_builder", pool[0], pool, 2, rng(2))!;
    const p = g.payload as Extract<typeof g.payload, { type: "sentence_builder" }>;
    const order = ["Me", "gusta", "la", "naranja"].map((w) => p.tokens.find((t) => t.text === w)!.id);
    expect(validate(g, { tokenIds: order }).correct).toBe(true);
    expect(validate(g, { tokenIds: [...order].reverse() }).correct).toBe(false);
  });
  it("fill blank uses the inflected form", () => {
    const g = buildGame("fill_blank", pool[4], pool, 2, rng(3))!;
    expect(validate(g, { word: "comemos" }).correct).toBe(true);
    expect(validate(g, { word: "beber" }).correct).toBe(false);
  });
  it("memory match checks pairs", () => {
    const g = buildGame("memory_match", pool[0], pool, 1, rng(4))!;
    const a = g.answer as Extract<typeof g.answer, { type: "memory_match" }>;
    const keys = Object.keys(a.pairs).filter((k) => k.startsWith("w"));
    const pairs = keys.map((k) => [k, a.pairs[k]] as [string, string]);
    expect(checkPair(g.answer, pairs[0][0], pairs[0][1])).toBe(true);
    expect(validate(g, { pairs }).correct).toBe(true);
    expect(validate(g, { pairs: pairs.slice(1) }).correct).toBe(false);
  });
  it("is deterministic for a seed", () => {
    expect(buildGame("picture_choice", pool[0], pool, 2, rng(9))).toEqual(buildGame("picture_choice", pool[0], pool, 2, rng(9)));
  });
  it("focus words prioritise due reviews, then weak words, and limit new words", () => {
    const uw = new Map<string, UserWordState>([
      ["2", word("2", { dueAt: new Date(now.getTime() - 1000) })],
      ["3", word("3", { skills: { recognition: 0.1, listening: 0, production: 0 } })],
      ["4", word("4")],
    ]);
    const f = pickFocusWords(pool, uw, 3, now, "recognition", 1).map((v) => v.id);
    expect(f[0]).toBe("2");
    expect(f).toContain("3");
    expect(f.filter((id) => !uw.has(id)).length).toBe(1);
  });
});

describe("game eligibility", () => {
  it("filters words that can support each game type", async () => {
    const { supportsType } = await import("@/lib/engine");
    expect(supportsType("drag_drop", pool[0])).toBe(true);
    expect(supportsType("drag_drop", pool[4])).toBe(false);
    expect(supportsType("fill_blank", pool[4])).toBe(true);
    expect(supportsType("sentence_builder", pool[1])).toBe(false);
  });
});
