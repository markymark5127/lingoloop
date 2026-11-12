/**
 * Offline (no API key) templates for learners of Japanese. Japanese lines are word-spaced with a
 * matching kana reading; translations are English (Japanese is only offered to English speakers).
 */
import { StoryScript, VideoScript, type Correction } from "@/lib/content/schemas";
import { translate, type Locale } from "@/lib/i18n/core";
import type { GenerationContext, WordHint } from "./types";

type Bg = VideoScript["body"]["scenes"][number]["bg"];

const FALLBACK_NOUNS: WordHint[] = [
  { lemma: "ケーキ", reading: "ケーキ", translation: "cake", emoji: "🎂", pos: "noun" },
  { lemma: "猫", reading: "ねこ", translation: "cat", emoji: "🐱", pos: "noun" },
  { lemma: "かぎ", reading: "かぎ", translation: "key", emoji: "🔑", pos: "noun" },
  { lemma: "りんご", reading: "りんご", translation: "apple", emoji: "🍎", pos: "noun" },
];

function nouns(ctx: GenerationContext): WordHint[] {
  const own = ctx.focusWords.filter((w) => w.pos === "noun" && w.emoji && !/\s/.test(w.lemma));
  const seen = new Set(own.map((w) => w.lemma));
  return [...own, ...FALLBACK_NOUNS.filter((w) => !seen.has(w.lemma))];
}

const R = (w: WordHint) => w.reading || w.lemma;
const en = (key: string, words: Record<string, WordHint | string>) =>
  translate("en", key, Object.fromEntries(Object.entries(words).map(([k, v]) => [k, typeof v === "string" ? v : v.translation])));

// [text, reading, english template, emoji, bg]
type Scene = [string, string, string, string, Bg];
interface Tpl {
  title: string;
  summary: string;
  scenes: Scene[];
  q: [string, string[], number][];
}

const VIDEO: Record<string, (a: WordHint, b: WordHint) => Tpl> = {
  comedy: (a, b) => ({
    title: `ポチと${a.lemma}`,
    summary: "A hungry dog finds a {a} — and a surprise.",
    scenes: [
      ["ポチ 、 おなか ペコペコ 。", "ポチ 、 おなか ペコペコ 。", "Pochi is starving.", "🐶", "candy"],
      [`あれ ？ 台所 に ${a.lemma} が ある ！`, `あれ ？ だいどころ に ${R(a)} が ある ！`, "Huh? There's a {a} in the kitchen!", a.emoji ?? "🍽️", "sunset"],
      [`ポチ 、 そっと ${a.lemma} に 近づいて …`, `ポチ 、 そっと ${R(a)} に ちかづいて …`, "Pochi creeps up to the {a}…", `🐶${a.emoji ?? ""}`, "candy"],
      [`えっ ！ ${b.lemma} が 動いた ！`, `えっ ！ ${R(b)} が うごいた ！`, "What?! The {b} moved!", `${b.emoji ?? "❓"}😱`, "night"],
      ["ポチ 、 公園 まで 全力 で 逃げた 。", "ポチ 、 こうえん まで ぜんりょく で にげた 。", "Pochi ran for his life all the way to the park.", "🏃🌳", "forest"],
    ],
    q: [
      ["What is in the kitchen?", ["A {a}", "A shoe", "A phone"], 0],
      ["Why does Pochi run away?", ["He is tired", "The {b} moves", "It is raining"], 1],
    ],
  }),
  mystery: (a, b) => ({
    title: `${a.lemma}の事件`,
    summary: "A detective investigates a missing {a}.",
    scenes: [
      ["夜 。 探偵 の アナ が 呼ばれて きた 。", "よる 。 たんてい の アナ が よばれて きた 。", "Night. Detective Ana has been called in.", "🕵️‍♀️🏠", "night"],
      [`「 ${a.lemma} が ない ん です ！ 」`, `「 ${R(a)} が ない ん です ！ 」`, "\"The {a} is gone!\"", a.emoji ?? "❓", "night"],
      [`テーブル の 上 に は ${b.lemma} だけ 。`, `テーブル の うえ に は ${R(b)} だけ 。`, "On the table, there's only a {b}.", b.emoji ?? "🔎", "city"],
      ["アナ が 猫 を じっと 見る 。 猫 も 目 を そらさない 。", "アナ が ねこ を じっと みる 。 ねこ も め を そらさない 。", "Ana stares at the cat. The cat doesn't look away either.", "🐱👀", "night"],
      [`犯人 は 猫 ！ ${a.lemma} 、 ずっと 持ってた ！`, `はんにん は ねこ ！ ${R(a)} 、 ずっと もってた ！`, "The culprit: the cat! It had the {a} all along!", `😼${a.emoji ?? ""}`, "sunset"],
    ],
    q: [
      ["What is missing?", ["The car", "The {a}", "The detective"], 1],
      ["Who had it?", ["The cat", "Ana", "Nobody"], 0],
    ],
  }),
  "sci-fi": (a, b) => ({
    title: `ロボと${a.lemma}`,
    summary: "A robot on the Moon discovers a {a}.",
    scenes: [
      ["ぼく 、 ロボ 。 月 に 住んでる ロボット です 。", "ぼく 、 ロボ 。 つき に すんでる ロボット です 。", "I'm Robo, a robot who lives on the Moon.", "🤖🌙", "space"],
      [`今日 、 ${a.lemma} を 見つけた ん だ 。`, `きょう 、 ${R(a)} を みつけた ん だ 。`, "Today I found a {a}.", a.emoji ?? "✨", "desert"],
      [`なんで 月 に ？ ${b.lemma} でも ない し …`, `なんで つき に ？ ${R(b)} でも ない し …`, "Why is it on the Moon? It's not a {b} either…", "🤔", "space"],
      ["地球 に 連絡 だ ！ 「 大発見 です ！ 」", "ちきゅう に れんらく だ ！ 「 だいはっけん です ！ 」", 'Time to call Earth! "Big discovery!"', "📡🌍", "space"],
      [`… と 思ったら 、 ぼく の お昼 の ${a.lemma} だった 。`, `… と おもったら 、 ぼく の おひる の ${R(a)} だった 。`, "…turns out it was the {a} from my own lunch.", "🤖😅", "sunset"],
    ],
    q: [
      ["Where is Robo?", ["On the Moon", "On Mars", "In Tokyo"], 0],
      ["What was the discovery really?", ["Alien life", "His lunch", "A new planet"], 1],
    ],
  }),
  travel: (a, b) => ({
    title: "京都の一日",
    summary: "A traveler explores Kyoto and buys a {a}.",
    scenes: [
      ["どうも ！ 今日 は 京都 に 来てます 。", "どうも ！ きょう は きょうと に きてます 。", "Hey there! Today I'm in Kyoto.", "🧳⛩️", "sunset"],
      ["それ に して も 暑い ！", "それ に して も あつい ！", "Man, it's hot!", "☀️🥵", "desert"],
      [`お店 で ${a.lemma} 、 買っちゃった 。`, `おみせ で ${R(a)} 、 かっちゃった 。`, "I couldn't resist buying a {a} at a shop.", a.emoji ?? "🛍️", "city"],
      [`あ 、 ${b.lemma} ！ かわいい ！`, `あ 、 ${R(b)} ！ かわいい ！`, "Oh, a {b}! So cute!", b.emoji ?? "👀", "city"],
      ["夜 は お祭り ！ 最高 ！", "よる は おまつり ！ さいこう ！", "And at night, a festival! The best!", "🏮🎆", "night"],
    ],
    q: [
      ["What is the weather like?", ["Rainy", "Very hot", "Snowy"], 1],
      ["What happens at night?", ["A festival", "A movie", "Sleeping"], 0],
    ],
  }),
};
VIDEO.everyday = VIDEO.comedy;
VIDEO.food = VIDEO.travel;
VIDEO.adventure = VIDEO["sci-fi"];
VIDEO.romance = VIDEO.travel;

export function generateVideoJa(ctx: GenerationContext) {
  const [a, b] = nouns(ctx);
  const tpl = (VIDEO[ctx.genre] ?? VIDEO.comedy)(a, b);
  const w = { a, b };
  return VideoScript.parse({
    title: tpl.title,
    summary: en(tpl.summary, w),
    genre: VIDEO[ctx.genre] ? ctx.genre : "comedy",
    body: {
      scenes: tpl.scenes.map(([text, reading, eng, emoji, bg]) => ({ text, reading, translation: en(eng, w), emoji, bg })),
      questions: tpl.q.map(([q, options, answer]) => ({ q: en(q, w), options: options.map((o) => en(o, w)), answer })),
    },
  });
}

export function generateStoryJa(ctx: GenerationContext) {
  const [a, b, c] = nouns(ctx);
  const hero = ctx.series?.characters[0]?.split(" ")[0] ?? "ハナ";
  const w = { a, b, c, hero };
  const p = (es: string, reading: string, key: string) => ({ es, reading, en: en(key, w) });
  return StoryScript.parse({
    title: ctx.series ? `${ctx.series.title}：新しい日` : `${hero}と${a.lemma}`,
    summary: en("{hero} has an unexpected day involving a {a}.", w),
    genre: ctx.genre in VIDEO ? ctx.genre : "everyday",
    body: {
      characters: [hero, "ケン"],
      chapters: [
        {
          title: "いつもとちがう朝",
          paragraphs: [
            p(
              `${hero} は 小さな アパート で ひとり 暮らし 。 朝 は いつも コーヒー と パン 。`,
              `${hero} は ちいさな アパート で ひとり ぐらし 。 あさ は いつも コーヒー と パン 。`,
              "{hero} lives alone in a small apartment. Mornings are always coffee and bread.",
            ),
            p(
              `でも 今日 は 、 テーブル の 上 に ${a.lemma} が あった 。 「 え 、 だれ の ？ 」`,
              `でも きょう は 、 テーブル の うえ に ${R(a)} が あった 。 「 え 、 だれ の ？ 」`,
              "But today, there was a {a} on the table. \"Huh? Whose is this?\"",
            ),
            p(
              `そこ へ 友だち の ケン が ${b.lemma} を 持って 来た 。 「 これ 、 ケン の ？ 」 「 いや 、 知らない よ 。 」`,
              `そこ へ ともだち の ケン が ${R(b)} を もって きた 。 「 これ 、 ケン の ？ 」 「 いや 、 しらない よ 。 」`,
              'Just then her friend Ken came over with a {b}. "Is this yours, Ken?" "Nope, no idea."',
            ),
            p(
              `${a.lemma} の 下 に メモ が 一枚 。 「 ${c.lemma} を 探して 」 。 いったい 、 だれ が ？`,
              `${R(a)} の した に メモ が いちまい 。 「 ${R(c)} を さがして 」 。 いったい 、 だれ が ？`,
              'Under the {a}, a note: "Find the {c}." Who on earth wrote it?',
            ),
          ],
          questions: [
            { q: en("What is on the table?", w), options: [en("A {a}", w), en("A dog", w), en("A book", w)], answer: 0 },
            { q: en("What does the note say?", w), options: [en("Go home", w), en("Find the {c}", w), en("Drink coffee", w)], answer: 1 },
          ],
        },
      ],
    },
  });
}

/** Deterministic, high-value mistakes for the offline Japanese tutor. */
export function detectCommonErrorsJa(msg: string, locale: Locale = "en"): Correction[] {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const out: Correction[] = [];
  let m: RegExpMatchArray | null;
  if ((m = msg.match(/(私|わたし|ぼく)\s*わ/))) out.push({ original: m[0], corrected: `${m[1]}は`, explanation: t("The topic particle 'wa' is written は, not わ.") });
  if ((m = msg.match(/こんにちわ|こんばんわ/))) out.push({ original: m[0], corrected: m[0].replace(/わ$/, "は"), explanation: t("In greetings like こんにちは, the final 'wa' is written は.") });
  const latin = (msg.match(/[A-Za-z]/g) ?? []).length;
  const jaChars = (msg.match(/[぀-ヿ一-鿿]/g) ?? []).length;
  if (latin > jaChars) out.push({ original: msg.slice(0, 60), corrected: t("(try it in Japanese)"), explanation: t("Try saying it in Japanese — e.g. '…を ください' (… please), 'ありがとう' (thank you), 'すみません' (excuse me).") });
  return out.slice(0, 2);
}
