import { describe, expect, it } from "vitest";
import { STARTER_VOCAB_JA_TARGET } from "@/lib/content/japanese/vocab";
import { STARTER_STORIES_JA, STARTER_VIDEOS_JA } from "@/lib/content/japanese/content";
import { SCENARIOS_JA_TARGET } from "@/lib/content/japanese/scenarios";
import { StoryBody, VideoBody, checkTargetText } from "@/lib/content/schemas";
import { allowedTargets, displayText, kanaToRomaji, langOfText } from "@/lib/lang";
import { alignReading, answersMatch, buildFormIndex, matchVocab, sentences, tokenize } from "@/lib/engine/text";
import { buildGame, buildStoryChallenge, findSurface, morae, pitchPattern, rng, validate, type VocabEntry } from "@/lib/engine/games";
import { OfflineProvider } from "@/lib/ai/offline";
import { detectCommonErrorsJa } from "@/lib/ai/offline-ja";
import { getScenario, scenariosFor } from "@/lib/content/scenarios";

const words = (s: string) => s.trim().split(/\s+/).length;

/** Every Japanese line in the starter data, with its reading. */
const lines: { where: string; text: string; reading?: string }[] = [
  ...STARTER_VOCAB_JA_TARGET.map((v) => ({ where: `vocab ${v.lemma}`, text: v.example, reading: v.example_reading })),
  ...STARTER_VIDEOS_JA.flatMap((v) => v.body.scenes.map((s, i) => ({ where: `${v.title} scene ${i}`, text: s.text, reading: s.reading }))),
  ...STARTER_STORIES_JA.flatMap((s) => s.body.chapters.flatMap((c) => c.paragraphs.map((p, i) => ({ where: `${s.title}/${c.title} p${i}`, text: p.es, reading: p.reading })))),
  ...SCENARIOS_JA_TARGET.flatMap((s) => [s.opening, ...s.turns].map((l, i) => ({ where: `${s.id} line ${i}`, text: l.text, reading: l.reading }))),
];

describe("Japanese starter data", () => {
  it("every line has a kana reading with the same word breaks", () => {
    const bad = lines.filter((l) => !l.reading || words(l.text) !== words(l.reading)).map((l) => `${l.where}: ${l.text} | ${l.reading}`);
    expect(bad).toEqual([]);
  });

  it("readings are kana only (no kanji)", () => {
    const bad = lines.filter((l) => /[一-鿿]/.test(l.reading ?? "")).map((l) => l.where);
    expect(bad).toEqual([]);
    expect(STARTER_VOCAB_JA_TARGET.filter((v) => /[一-鿿]/.test(v.reading)).map((v) => v.lemma)).toEqual([]);
  });

  it("starter content validates and passes the A1 checks", () => {
    for (const v of STARTER_VIDEOS_JA) {
      VideoBody.parse(v.body);
      expect(checkTargetText(v.body.scenes.map((s) => s.text), "A1", "ja").problems).toEqual([]);
    }
    for (const s of STARTER_STORIES_JA) {
      StoryBody.parse(s.body);
      expect(checkTargetText(s.body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)), "A1", "ja").problems).toEqual([]);
    }
  });

  it("each vocab item appears in its own example (so fill-in-the-blank works)", () => {
    const missing = STARTER_VOCAB_JA_TARGET.filter((v) => !findSurface(v.example, { lemma: v.lemma, forms: v.forms })).map((v) => v.lemma);
    expect(missing).toEqual([]);
  });

  it("lemmas are unique", () => {
    const lemmas = STARTER_VOCAB_JA_TARGET.map((v) => v.lemma);
    expect(new Set(lemmas).size).toBe(lemmas.length);
  });
});

describe("Japanese text helpers", () => {
  it("converts kana to Hepburn romaji", () => {
    expect(kanaToRomaji("ねこ は ベッド で ねています 。")).toBe("neko wa beddo de neteimasu .");
    expect(kanaToRomaji("きょう")).toBe("kyou");
    expect(kanaToRomaji("がっこう へ いきます")).toBe("gakkou e ikimasu");
    expect(kanaToRomaji("コーヒー を ください")).toBe("koohii o kudasai");
    expect(kanaToRomaji("こんにちは")).toBe("konnichiha");
    expect(kanaToRomaji("きんえん")).toBe("kin'en");
    expect(kanaToRomaji("まっちゃ")).toBe("matcha");
  });

  it("hides word spaces when displaying Japanese, keeps Spanish as-is", () => {
    expect(displayText("猫 は ベッド で 寝ています 。")).toBe("猫はベッドで寝ています。");
    expect(displayText("Wi-Fi の パスワード")).toBe("Wi-Fiのパスワード");
    expect(displayText("Hola, ¿qué tal?")).toBe("Hola, ¿qué tal?");
    expect(langOfText("猫")).toBe("ja");
    expect(langOfText("gato")).toBe("es");
  });

  it("tokenizes word-spaced Japanese into tappable words without spaces", () => {
    const t = tokenize("「 かぎ は どこ ？ 」 と 聞きます 。");
    expect(t.filter((x) => x.word).map((x) => x.text)).toEqual(["かぎ", "は", "どこ", "と", "聞きます"]);
    expect(t.map((x) => x.text).join("")).toBe("「かぎはどこ？」と聞きます。");
  });

  it("aligns readings word-for-word", () => {
    const text = "すみません 、 駅 は どこ です か 。";
    const toks = tokenize(text);
    const r = alignReading(text, toks, "すみません 、 えき は どこ です か 。");
    expect(toks.map((t, i) => (t.word ? r[i] : null)).filter(Boolean)).toEqual(["すみません", "えき", "は", "どこ", "です", "か"]);
    expect(alignReading(text, toks, "ずれた よみ").every((x) => x === null)).toBe(true);
  });

  it("splits Japanese sentences and compares answers ignoring spaces", () => {
    expect(sentences("こんにちは ！ 元気 です か 。 はい 。")).toEqual(["こんにちは ！", "元気 です か 。", "はい 。"]);
    expect(answersMatch("猫 は 寝ます", "猫は寝ます")).toBe(true);
    expect(answersMatch("猫 は 寝ます", "犬は寝ます")).toBe(false);
  });

  it("matches vocabulary in spaced and unspaced Japanese", () => {
    const items = STARTER_VOCAB_JA_TARGET.map((v, i) => ({ id: String(i), lemma: v.lemma, forms: v.forms }));
    const idx = buildFormIndex(items);
    const id = (lemma: string) => String(STARTER_VOCAB_JA_TARGET.findIndex((v) => v.lemma === lemma));
    expect(matchVocab("猫 が 牛乳 を 飲みます 。", items, idx)).toEqual(expect.arrayContaining([id("猫"), id("牛乳"), id("飲む")]));
    expect(matchVocab("コーヒーをください", items, idx)).toEqual(expect.arrayContaining([id("コーヒー"), id("ください")]));
  });

  it("only English speakers can pick Japanese", () => {
    expect(allowedTargets("en")).toEqual(["es", "ja"]);
    expect(allowedTargets("ja")).toEqual(["es"]);
  });
});

describe("Japanese games", () => {
  const pool: VocabEntry[] = STARTER_VOCAB_JA_TARGET.map((v, i) => ({
    id: `v${i}`,
    lemma: v.lemma,
    translation: v.translation,
    emoji: v.emoji,
    article: null,
    pos: v.part_of_speech,
    example: v.example,
    exampleTranslation: v.example_translation,
    reading: v.reading,
    exampleReading: v.example_reading,
    forms: v.forms,
    accent: v.pitch_accent,
  }));
  const get = (lemma: string) => pool.find((v) => v.lemma === lemma)!;

  it("picture choice uses a Japanese instruction with a reading", () => {
    const g = buildGame("picture_choice", get("猫"), pool, 2, rng(1), "ja")!;
    expect(g.payload).toMatchObject({ instruction: "「 猫 」 は どれ ？", instructionReading: "「 ねこ 」 は どれ ？" });
    expect(JSON.stringify(g.payload)).not.toMatch(/cat/i);
  });

  it("sentence builder uses word chunks with per-word readings and validates", () => {
    const g = buildGame("sentence_builder", get("飲む"), pool, 2, rng(2), "ja")!;
    const p = g.payload as Extract<typeof g.payload, { type: "sentence_builder" }>;
    expect(p.tokens.map((t) => t.text).sort()).toEqual(["毎朝", "水", "を", "一杯", "飲みます"].sort());
    expect(p.tokens.find((t) => t.text === "毎朝")?.sub).toBe("まいあさ");
    const order = ["毎朝", "水", "を", "一杯", "飲みます"].map((w) => p.tokens.find((t) => t.text === w)!.id);
    expect(validate(g, { tokenIds: order }).correct).toBe(true);
    expect(validate(g, { tokenIds: [...order].reverse() }).correct).toBe(false);
    // Meaning comes from a picture + audio, never an English translation.
    expect(p).toMatchObject({ speak: get("飲む").example, audio: "auto" });
    expect(p.emoji).toContain(get("水").emoji);
    expect(JSON.stringify(p)).not.toMatch(/[A-Za-z]{3,}.*drink/i);
  });

  it("gets harder with level: decoy words, then audio fades", () => {
    const mid = buildGame("sentence_builder", get("飲む"), pool, 3, rng(5), "ja")!;
    const hard = buildGame("sentence_builder", get("飲む"), pool, 5, rng(5), "ja")!;
    const mp = mid.payload as Extract<typeof mid.payload, { type: "sentence_builder" }>;
    const hp = hard.payload as Extract<typeof hard.payload, { type: "sentence_builder" }>;
    expect(mp.tokens).toHaveLength(6);
    expect(mp.audio).toBe("tap");
    expect(hp.tokens).toHaveLength(7);
    expect(hp).toMatchObject({ audio: "none" });
    expect(hp.speak).toBeUndefined();
    // Decoys must be left out.
    const order = ["毎朝", "水", "を", "一杯", "飲みます"].map((w) => hp.tokens.find((t) => t.text === w && t.id.startsWith("t"))!.id);
    expect(validate(hard, { tokenIds: order }).correct).toBe(true);
    expect(validate(hard, { tokenIds: [...order, hp.tokens.find((t) => t.id.startsWith("d"))!.id] }).correct).toBe(false);
  });

  it("fill in the blank offers same-form distractors and readings around the blank", () => {
    const g = buildGame("fill_blank", get("食べる"), pool, 3, rng(3), "ja")!;
    const p = g.payload as Extract<typeof g.payload, { type: "fill_blank" }>;
    expect(g.answer).toEqual({ type: "fill_blank", word: "食べました" });
    expect(p.options).toContain("食べました");
    expect(p.options.filter((o) => o !== "食べました").every((o) => o.endsWith("ました"))).toBe(true);
    expect(p.beforeReading).toBe("おひる 、 もう");
    expect(validate(g, { word: "食べました" }).correct).toBe(true);
  });

  it("memory cards show readings for kanji words", () => {
    const g = buildGame("memory_match", get("犬"), pool, 2, rng(4), "ja")!;
    const p = g.payload as Extract<typeof g.payload, { type: "memory_match" }>;
    expect(p.cards.find((c) => c.face === "犬")?.sub).toBe("いぬ");
  });

  it("story challenge asks which picture appeared in the video, in Japanese", () => {
    const g = buildStoryChallenge("ロボと月", ["🤖🌙", "📡🌍"], ["🐶", "🎂", "🏮🎆", "🤖🌙"], [], rng(6), "ja", 2)!;
    const p = g.payload as Extract<typeof g.payload, { type: "story_challenge" }>;
    expect(p.instruction).toBe("ビデオ に 出てきた の は どれ ？");
    expect(p.options.length).toBeGreaterThanOrEqual(3);
    const a = g.answer as { index: number };
    expect(["🤖🌙", "📡🌍"]).toContain(p.options[a.index]);
    expect(p.options.filter((o) => o === "🤖🌙" || o === "📡🌍")).toHaveLength(1);
    expect(buildStoryChallenge("x", ["🐶"], ["🐶"], [], rng(1))).toBeNull();
  });
});

describe("Pitch accent", () => {
  it("splits morae and draws Tokyo pitch patterns (with the following particle)", () => {
    expect(morae("きょう")).toEqual(["きょ", "う"]);
    expect(morae("がっこう")).toEqual(["が", "っ", "こ", "う"]);
    expect(morae("コーヒー")).toEqual(["コ", "ー", "ヒ", "ー"]);
    expect(pitchPattern(2, 1)).toEqual([1, 0, 0]); // はし 箸: HL-L
    expect(pitchPattern(2, 2)).toEqual([0, 1, 0]); // はし 橋: LH-L
    expect(pitchPattern(2, 0)).toEqual([0, 1, 1]); // はし 端: LH-H
    expect(pitchPattern(4, 3)).toEqual([0, 1, 1, 0, 0]); // コーヒー
  });

  it("homophones become a pick-the-picture game; other words pick the contour", () => {
    const pool: VocabEntry[] = STARTER_VOCAB_JA_TARGET.map((v, i) => ({ id: `v${i}`, lemma: v.lemma, translation: v.translation, emoji: v.emoji, article: null, pos: v.part_of_speech, example: v.example, exampleTranslation: v.example_translation, reading: v.reading, exampleReading: v.example_reading, forms: v.forms, accent: v.pitch_accent }));
    const hashi = pool.find((v) => v.lemma === "箸")!;
    const pair = buildGame("pitch_accent", hashi, pool, 2, rng(1), "ja")!;
    const pp = pair.payload as Extract<typeof pair.payload, { type: "pitch_accent"; mode: "pair" }>;
    expect(pp.mode).toBe("pair");
    expect(pp.contour).toEqual([1, 0, 0]);
    expect(pp.options.map((o) => o.emoji).sort()).toEqual(["🌉", "🥢"].sort());
    expect(validate(pair, { index: pp.options.findIndex((o) => o.emoji === "🥢") }).correct).toBe(true);
    expect(validate(pair, { index: pp.options.findIndex((o) => o.emoji === "🌉") }).correct).toBe(false);

    const neko = pool.find((v) => v.lemma === "猫")!;
    const pat = buildGame("pitch_accent", neko, pool, 4, rng(2), "ja")!;
    const pt = pat.payload as Extract<typeof pat.payload, { type: "pitch_accent"; mode: "pattern" }>;
    expect(pt.mode).toBe("pattern");
    expect(pt.options).toHaveLength(3); // ねこ has 3 possible patterns
    expect(pt.speak).toBeUndefined(); // no audio at high difficulty
    expect(validate(pat, { index: pt.options.findIndex((o) => o.join() === "1,0,0") }).correct).toBe(true);
    expect(buildGame("pitch_accent", neko, pool, 2, rng(2), "es")).toBeNull();
  });

  it("accents are tagged for most words and stay within the word length", () => {
    const tagged = STARTER_VOCAB_JA_TARGET.filter((v) => v.pitch_accent != null);
    expect(tagged.length).toBeGreaterThan(70);
    expect(tagged.filter((v) => v.pitch_accent! > morae(v.reading).length).map((v) => v.lemma)).toEqual([]);
  });
});

describe("Offline engine (Japanese)", () => {
  const ai = new OfflineProvider();
  const ctx = { language: "ja" as const, level: "A1", genre: "mystery", interests: [], focusWords: [{ lemma: "猫", reading: "ねこ", translation: "cat", emoji: "🐱", pos: "noun" }], knownWords: [] };

  it("generates schema-valid Japanese videos and stories with aligned readings", async () => {
    for (const genre of ["comedy", "mystery", "sci-fi", "travel", "food"]) {
      const v = await ai.generateVideo({ ...ctx, genre });
      for (const s of v.body.scenes) expect(words(s.text)).toBe(words(s.reading!));
      expect(checkTargetText(v.body.scenes.map((s) => s.text), "A1", "ja").ok).toBe(true);
    }
    const s = await ai.generateStory(ctx);
    for (const p of s.body.chapters[0].paragraphs) expect(words(p.es)).toBe(words(p.reading!));
    expect(s.body.chapters[0].paragraphs[1].en).toContain("cat");
  });

  it("roleplays Japanese scenarios and spots classic mistakes", async () => {
    const scenario = getScenario("ja-ramen")!;
    const turn = await ai.chat({ scenario, level: "A1", nativeLanguage: "en", history: [], userMessage: "ラーメン を ください", knownWords: [], focusWords: [], turnIndex: 0 });
    expect(turn.reply).toContain("お飲み物");
    expect(words(turn.reply)).toBe(words(turn.reading!));
    expect(detectCommonErrorsJa("わたしわ アナ です")[0].corrected).toBe("わたしは");
    expect(detectCommonErrorsJa("I want ramen please")[0].corrected).toBe("(try it in Japanese)");
  });

  it("keeps Spanish and Japanese scenarios separate", () => {
    expect(scenariosFor("ja").every((s) => s.id.startsWith("ja-"))).toBe(true);
    expect(scenariosFor("es").some((s) => s.id === "restaurant")).toBe(true);
  });
});
