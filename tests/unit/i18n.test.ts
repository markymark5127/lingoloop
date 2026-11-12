import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JA } from "@/lib/i18n/ja";
import { negotiateLocale, translate } from "@/lib/i18n/core";
import { localizeBody, localizeContent } from "@/lib/i18n/content";
import { contentJa } from "@/lib/content/ja-content";
import { STARTER_STORIES, STARTER_VIDEOS } from "@/lib/content/starter-content";
import { STARTER_VOCAB } from "@/lib/content/starter-vocab";
import { STARTER_VOCAB_JA } from "@/lib/content/starter-vocab-ja";
import { scenariosFor } from "@/lib/content/scenarios";
import { OfflineProvider, detectCommonErrors } from "@/lib/ai/offline";
import { buildGame, type VocabEntry } from "@/lib/engine";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?)$/.test(f) ? [p] : [];
  });
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("Japanese UI dictionary", () => {
  const src = files(path.resolve(import.meta.dirname, "../../src")).filter((f) => !/i18n\/ja\.ts$|ja-content\.ts$/.test(f));
  const literalKeys = new Set<string>();
  for (const f of src) {
    const code = readFileSync(f, "utf8");
    for (const m of code.matchAll(/\b(?:t|tr)\(\s*"((?:\\.|[^"\\])*)"/g)) literalKeys.add(JSON.parse(`"${m[1]}"`));
    for (const m of code.matchAll(/translate\(\s*[^,()]+,\s*"((?:\\.|[^"\\])*)"/g)) literalKeys.add(JSON.parse(`"${m[1]}"`));
  }

  it("has a translation for every literal key used in the code", () => {
    const missing = [...literalKeys].filter((k) => !(k in JA));
    expect(missing).toEqual([]);
    expect(literalKeys.size).toBeGreaterThan(250);
  });

  it("keeps every {placeholder}", () => {
    const broken = Object.entries(JA).filter(([en, ja]) => placeholders(en) !== placeholders(ja));
    expect(broken).toEqual([]);
  });

  it("covers dynamic labels: scenarios, genres, error messages", () => {
    for (const s of scenariosFor("es")) {
      expect(JA[s.title], s.title).toBeTruthy();
      expect(JA[s.goal], s.goal).toBeTruthy();
    }
    for (const g of ["comedy", "mystery", "sci-fi", "travel", "everyday", "romance", "food", "adventure"]) expect(JA[g]).toBeTruthy();
    expect(translate("ja", "Not signed in")).toBe("ログインしていません");
  });

  it("fills placeholders and falls back to English", () => {
    expect(translate("ja", "{n} day streak", { n: 3 })).toBe("3日連続");
    expect(translate("en", "{n} day streak", { n: 3 })).toBe("3 day streak");
    expect(translate("ja", "a string nobody translated")).toBe("a string nobody translated");
  });

  it("negotiates the locale from Accept-Language", () => {
    expect(negotiateLocale("ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
    expect(negotiateLocale("en-US,en;q=0.9,ja;q=0.5")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });
});

describe("Japanese content", () => {
  it("translates every starter story, video and scenario line", () => {
    const lines: string[] = [];
    for (const s of STARTER_STORIES) {
      lines.push(s.summary);
      for (const c of s.body.chapters) {
        lines.push(...c.paragraphs.map((p) => p.en));
        for (const q of c.questions) lines.push(q.q, ...q.options);
      }
    }
    for (const v of STARTER_VIDEOS) {
      lines.push(v.summary, ...v.body.scenes.map((s) => s.translation));
      for (const q of v.body.questions) lines.push(q.q, ...q.options);
    }
    for (const s of scenariosFor("es")) lines.push(s.opening.en, ...s.turns.map((t) => t.en));
    expect(lines.filter((l) => !contentJa(l))).toEqual([]);
  });

  it("glosses every starter vocabulary item", () => {
    expect(STARTER_VOCAB.filter((v) => !STARTER_VOCAB_JA[v.lemma]).map((v) => v.lemma)).toEqual([]);
  });

  it("projects stored bilingual content onto the learner's language", () => {
    const body = {
      summary_ja: "日本語の要約",
      chapters: [{ paragraphs: [{ es: "Hola.", en: "Hi.", ja: "こんにちは。" }], questions: [{ q: "Who?", options: ["A", "B"], q_ja: "誰？", options_ja: ["あ", "い"], answer: 1 }] }],
    };
    const ja = localizeContent({ summary: "English summary", body }, "ja");
    expect(ja.summary).toBe("日本語の要約");
    expect(ja.body.chapters[0].paragraphs[0].en).toBe("こんにちは。");
    expect(ja.body.chapters[0].questions[0]).toMatchObject({ q: "誰？", options: ["あ", "い"], answer: 1 });
    expect(localizeContent({ summary: "English summary", body }, "en").body.chapters[0].paragraphs[0].en).toBe("Hi.");
    // Items without Japanese fall back to English instead of breaking.
    expect(localizeBody({ scenes: [{ translation: "Hello" }] }, "ja").scenes[0].translation).toBe("Hello");
  });
});

describe("offline engine writes both languages", () => {
  const ctx = { level: "A1", genre: "mystery", interests: ["mystery"], focusWords: [], knownWords: [] };

  it("video scripts carry Japanese alongside English", async () => {
    const v = await new OfflineProvider().generateVideo(ctx);
    expect(v.body.summary_ja).toMatch(/[ぁ-んァ-ン一-龯]/);
    for (const s of v.body.scenes) {
      expect(s.translation_ja).toBeTruthy();
      expect(s.translation_ja).not.toBe(s.translation);
    }
    expect(v.body.questions[0].options_ja).toHaveLength(v.body.questions[0].options.length);
  });

  it("stories carry Japanese paragraphs", async () => {
    const s = await new OfflineProvider().generateStory({ ...ctx, genre: "everyday" });
    for (const p of s.body.chapters[0].paragraphs) expect(p.ja).toMatch(/[ぁ-んァ-ン一-龯]/);
  });

  it("tutor feedback follows the learner's language", async () => {
    expect(detectCommonErrors("yo es estudiante", "ja")[0].explanation).toContain("soy");
    expect(detectCommonErrors("yo es estudiante", "ja")[0].explanation).toMatch(/[ぁ-ん]/);
    expect(detectCommonErrors("私はピザがほしい", "ja")).toHaveLength(1);
    const turn = await new OfflineProvider().chat({
      scenario: scenariosFor("es")[0], level: "A1", nativeLanguage: "ja", history: [], userMessage: "Quiero pizza", knownWords: [], focusWords: [], turnIndex: 0,
    });
    expect(turn.translation).toMatch(/[ぁ-ん]/);
  });

  it("game instructions are translated", () => {
    const naranja: VocabEntry = { id: "1", lemma: "naranja", translation: "オレンジ", emoji: "🍊", article: "la", pos: "noun", example: null, exampleTranslation: null };
    const gato: VocabEntry = { ...naranja, id: "2", lemma: "gato", translation: "猫", emoji: "🐱", article: "el" };
    const g = buildGame("picture_choice", naranja, [naranja, gato], 1, () => 0.5);
    expect(g?.payload).toMatchObject({ instruction: "Toca la naranja" });
    expect(JSON.stringify(g?.payload)).not.toContain("オレンジ"); // immersion: no translation
  });
});
