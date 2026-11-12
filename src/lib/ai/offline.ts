/**
 * Offline content engine — used automatically when OPENAI_API_KEY is not configured.
 * It produces schema-valid, personalized content from templates and the learner's vocabulary,
 * so the full product loop (generation jobs, rendering, games, mastery) works without an API key.
 * It is clearly labelled in the UI as the offline engine; it is not a substitute for the LLM.
 *
 * Like the OpenAI provider, it writes every translation in English AND Japanese so generated
 * items can be shared by all learners. Template sentences are i18n keys: the English key is the
 * English output, and the Japanese comes from the dictionary with the same {a}/{b}/{c} slots.
 */
import {
  type ConversationSummary,
  type Correction,
  StoryScript,
  type TutorTurn,
  VideoScript,
} from "@/lib/content/schemas";
import { translate, toLocale, type Locale } from "@/lib/i18n/core";
import { contentJa } from "@/lib/content/ja-content";
import type { AIProvider, ChatTurnInput, GenerationContext, WordHint } from "./types";
import type { Scenario } from "@/lib/content/scenarios";
import { isJapaneseText } from "@/lib/lang";
import { detectCommonErrorsJa, generateStoryJa, generateVideoJa } from "./offline-ja";

const FALLBACK_NOUNS: WordHint[] = [
  { lemma: "naranja", translation: "orange", translation_ja: "オレンジ", article: "la", emoji: "🍊", pos: "noun" },
  { lemma: "gato", translation: "cat", translation_ja: "猫", article: "el", emoji: "🐱", pos: "noun" },
  { lemma: "pan", translation: "bread", translation_ja: "パン", article: "el", emoji: "🍞", pos: "noun" },
  { lemma: "llave", translation: "key", translation_ja: "鍵", article: "la", emoji: "🔑", pos: "noun" },
];

function nouns(ctx: GenerationContext): WordHint[] {
  const own = ctx.focusWords.filter((w) => w.pos === "noun" && w.article);
  const seen = new Set(own.map((w) => w.lemma));
  return [...own, ...FALLBACK_NOUNS.filter((w) => !seen.has(w.lemma))];
}

const def = (w: WordHint) => `${w.article} ${w.lemma}`;
const Def = (w: WordHint) => cap(def(w));
const indef = (w: WordHint) => `${w.article === "la" ? "una" : "un"} ${w.lemma}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Words = Partial<Record<"a" | "b" | "c" | "hero" | "n" | "title" | "goal", WordHint | string | number>>;
const gloss = (v: WordHint | string | number | undefined, l: Locale) =>
  typeof v === "object" ? (l === "ja" ? v.translation_ja || v.translation : v.translation) : String(v ?? "");

/** Render an English template key in both languages, filling word slots with each language's gloss. */
function both(key: string, words: Words = {}) {
  const vars = (l: Locale) => Object.fromEntries(Object.entries(words).map(([k, v]) => [k, gloss(v, l)]));
  return { en: translate("en", key, vars("en")), ja: translate("ja", key, vars("ja")) };
}

type Bg = VideoScript["body"]["scenes"][number]["bg"];
interface Tpl {
  title: string;
  summary: string;
  scenes: [string, string, string, Bg][]; // [spanish, english-template, emoji, bg]
  q: [string, string[], number][]; // [question, options, answer] (English templates)
}

const VIDEO_TEMPLATES: Record<string, (a: WordHint, b: WordHint) => Tpl> = {
  comedy: (a, b) => ({
    title: `¡${cap(a.lemma)} misteriosa!`,
    summary: "A hungry dog finds a {a} — and a surprise.",
    scenes: [
      ["Hoy Max tiene mucha hambre.", "Today Max is very hungry.", "🐶", "candy"],
      [`En la cocina hay ${indef(a)}.`, "In the kitchen there is a {a}.", a.emoji ?? "🍽️", "sunset"],
      [`Max quiere comer ${def(a)}.`, "Max wants to eat the {a}.", `🐶${a.emoji ?? ""}`, "candy"],
      [`Pero ${def(b)} se mueve. ¡Qué susto!`, "But the {b} moves. What a fright!", `${b.emoji ?? "❓"}😱`, "night"],
      ["Max corre al jardín. ¡Adiós, cocina!", "Max runs to the garden. Bye, kitchen!", "🏃🌳", "forest"],
    ],
    q: [
      ["What is in the kitchen?", ["A {a}", "A shoe", "A phone"], 0],
      ["Why does Max run away?", ["He is tired", "The {b} moves", "It is raining"], 1],
    ],
  }),
  mystery: (a, b) => ({
    title: `El caso de ${def(a)}`,
    summary: "A detective investigates a missing {a}.",
    scenes: [
      ["Es de noche. La detective Ana llega a la casa.", "It's night. Detective Ana arrives at the house.", "🕵️‍♀️🏠", "night"],
      [`¡${Def(a)} no está! ¿Dónde está?`, "The {a} isn't here! Where is it?", a.emoji ?? "❓", "night"],
      [`En la mesa hay ${indef(b)}.`, "On the table there is a {b}.", b.emoji ?? "🔎", "city"],
      ["Ana mira al gato. El gato mira a Ana.", "Ana looks at the cat. The cat looks at Ana.", "🐱👀", "night"],
      [`¡El gato tiene ${def(a)}! Caso cerrado.`, "The cat has the {a}! Case closed.", `😼${a.emoji ?? ""}`, "sunset"],
    ],
    q: [
      ["What is missing?", ["The car", "The {a}", "The detective"], 1],
      ["Who had it?", ["The cat", "Ana", "Nobody"], 0],
    ],
  }),
  "sci-fi": (a, b) => ({
    title: `Un robot y ${indef(a)}`,
    summary: "A robot on Mars discovers a {a}.",
    scenes: [
      ["Soy Robi, un robot en Marte.", "I'm Robi, a robot on Mars.", "🤖🪐", "space"],
      [`Hoy encuentro ${indef(a)} en la arena roja.`, "Today I find a {a} in the red sand.", a.emoji ?? "✨", "desert"],
      [`¿Qué es? No es ${indef(b)}.`, "What is it? It's not a {b}.", "🤔", "space"],
      ["Llamo a la Tierra: ¡hay vida en Marte!", "I call Earth: there is life on Mars!", "📡🌍", "space"],
      [`Pero... es mi ${a.lemma} del almuerzo.`, "But... it's my {a} from lunch.", "🤖😅", "sunset"],
    ],
    q: [
      ["Where is Robi?", ["On the Moon", "On Mars", "In Madrid"], 1],
      ["What was the discovery really?", ["Alien life", "His lunch", "A new planet"], 1],
    ],
  }),
  travel: (a, b) => ({
    title: "Mi primer día en Sevilla",
    summary: "A traveler explores Seville and buys a {a}.",
    scenes: [
      ["¡Hola! Hoy estoy en Sevilla.", "Hi! Today I'm in Seville.", "🧳🇪🇸", "sunset"],
      ["Hace mucho sol y calor.", "It's very sunny and hot.", "☀️🥵", "desert"],
      [`En el mercado compro ${indef(a)}.`, "At the market I buy a {a}.", a.emoji ?? "🛍️", "city"],
      [`También veo ${indef(b)} muy bonito.`, "I also see a very pretty {b}.", b.emoji ?? "👀", "city"],
      ["Por la noche, ¡flamenco!", "At night, flamenco!", "💃🎶", "night"],
    ],
    q: [
      ["What is the weather like?", ["Rainy", "Sunny and hot", "Snowy"], 1],
      ["What happens at night?", ["Flamenco", "A movie", "Sleeping"], 0],
    ],
  }),
};
VIDEO_TEMPLATES.everyday = VIDEO_TEMPLATES.comedy;
VIDEO_TEMPLATES.food = VIDEO_TEMPLATES.travel;
VIDEO_TEMPLATES.adventure = VIDEO_TEMPLATES["sci-fi"];
VIDEO_TEMPLATES.romance = VIDEO_TEMPLATES.travel;

function bilingualQuestion(question: string, options: string[], answer: number, words: Words) {
  const q = both(question, words);
  const opts = options.map((o) => both(o, words));
  return { q: q.en, options: opts.map((o) => o.en), q_ja: q.ja, options_ja: opts.map((o) => o.ja), answer };
}

export class OfflineProvider implements AIProvider {
  readonly name = "offline" as const;

  async generateVideo(ctx: GenerationContext) {
    if (ctx.language === "ja") return generateVideoJa(ctx);
    const [a, b] = nouns(ctx);
    const tpl = (VIDEO_TEMPLATES[ctx.genre] ?? VIDEO_TEMPLATES.comedy)(a, b);
    const summary = both(tpl.summary, { a, b });
    return VideoScript.parse({
      title: tpl.title,
      summary: summary.en,
      genre: VIDEO_TEMPLATES[ctx.genre] ? ctx.genre : "comedy",
      body: {
        summary_ja: summary.ja,
        scenes: tpl.scenes.map(([text, en, emoji, bg]) => {
          const tr = both(en, { a, b });
          return { text, translation: tr.en, translation_ja: tr.ja, emoji, bg };
        }),
        questions: tpl.q.map(([q, o, ans]) => bilingualQuestion(q, o, ans, { a, b })),
      },
    });
  }

  async generateStory(ctx: GenerationContext) {
    if (ctx.language === "ja") return generateStoryJa(ctx);
    const [a, b, c] = nouns(ctx);
    const hero = ctx.series?.characters[0] ?? "Clara";
    const title = ctx.series ? `${ctx.series.title}: un nuevo día` : `${hero} y ${def(a)}`;
    const w = { a, b, c, hero };
    const p = (es: string, key: string) => {
      const tr = both(key, w);
      return { es, en: tr.en, ja: tr.ja };
    };
    const summary = both("{hero} has an unexpected day involving a {a}.", w);
    return StoryScript.parse({
      title,
      summary: summary.en,
      genre: ctx.genre in VIDEO_TEMPLATES ? ctx.genre : "everyday",
      body: {
        summary_ja: summary.ja,
        characters: [hero, "Tomás"],
        chapters: [
          {
            title: "Una mañana diferente",
            paragraphs: [
              p(`${hero} vive en una casa pequeña. Cada mañana, ${hero} bebe café y come pan.`, "{hero} lives in a small house. Every morning, {hero} drinks coffee and eats bread."),
              p(`Hoy, en la mesa, hay ${indef(a)}. ${hero} no sabe de dónde es.`, "Today, on the table, there is a {a}. {hero} doesn't know where it is from."),
              p(`Su amigo Tomás llega con ${indef(b)}. "¿Es tuyo?", pregunta ${hero}. "No", dice Tomás.`, 'Her friend Tomás arrives with a {b}. "Is it yours?", asks {hero}. "No," says Tomás.'),
              p(`Debajo de ${def(a)} hay una nota: "Busca ${def(c)}". ¿Quién escribe la nota?`, 'Under the {a} there is a note: "Look for the {c}." Who writes the note?'),
            ],
            questions: [
              bilingualQuestion("What is on the table?", ["A {a}", "A dog", "A book"], 0, w),
              bilingualQuestion("What does the note say?", ["Go home", "Look for the {c}", "Drink coffee"], 1, w),
            ],
          },
        ],
      },
    });
  }

  async chat(input: ChatTurnInput): Promise<TutorTurn> {
    const locale = toLocale(input.nativeLanguage);
    const s = input.scenario;
    const msg = input.userMessage;
    const turn = s.turns[Math.min(input.turnIndex, s.turns.length - 1)];
    const tr = (en: string) => (locale === "ja" ? contentJa(en.trim()) ?? en : en);
    if (s.language === "ja") {
      const ack = /ありがと/.test(msg)
        ? { text: "どういたしまして ！ ", reading: "どういたしまして ！ ", en: "You're welcome! " }
        : /[?？]|か[。]?$/.test(msg.trim())
          ? { text: "いい 質問 です ね ！ ", reading: "いい しつもん です ね ！ ", en: "Good question! " }
          : { text: "", reading: "", en: "" };
      return { reply: ack.text + turn.text, reading: ack.reading + (turn.reading ?? turn.text), translation: ack.en + turn.en, corrections: detectCommonErrorsJa(msg, locale) };
    }
    const ack = /gracias/i.test(msg) ? { es: "¡De nada! ", en: "You're welcome! " } : /\?/.test(msg) ? { es: "¡Buena pregunta! ", en: "Good question! " } : { es: "", en: "" };
    const translation = locale === "ja" ? [ack.en && tr(ack.en), tr(turn.en)].filter(Boolean).join("") : ack.en + turn.en;
    return { reply: ack.es + turn.text, translation, corrections: detectCommonErrors(msg, locale) };
  }

  async summarize(input: { scenario: Pick<Scenario, "title" | "goal" | "language"> & { turns?: Scenario["turns"] }; level: string; nativeLanguage?: string; transcript: { role: string; content: string; corrections?: unknown }[] }): Promise<ConversationSummary> {
    const locale = toLocale(input.nativeLanguage);
    const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
    const userMsgs = input.transcript.filter((m) => m.role === "user");
    const corrections = input.transcript.flatMap((m) => (Array.isArray(m.corrections) ? (m.corrections as Correction[]) : [])).slice(0, 5);
    const ja = input.scenario.language === "ja";
    const inTarget = userMsgs.filter((m) =>
      ja ? isJapaneseText(m.content) && (m.content.match(/[A-Za-z]/g) ?? []).length < 3 : !/\b(the|and|i|you|is)\b/i.test(m.content) && !JAPANESE.test(m.content),
    ).length;
    return {
      overview: t('You exchanged {n} messages in "{title}". Goal: {goal}.', { n: userMsgs.length, title: t(input.scenario.title), goal: t(input.scenario.goal) }),
      strengths: [
        inTarget > 0 ? t(ja ? "{n} of your messages were fully in Japanese" : "{n} of your messages were fully in Spanish", { n: inTarget }) : t("You kept the conversation going"),
        ...(corrections.length === 0 ? [t("No major errors noticed — nice work!")] : []),
      ],
      corrections,
      usefulPhrases: (input.scenario.turns ?? []).slice(0, 3).map((x) => ({ es: x.text, ...(x.reading ? { reading: x.reading } : {}), en: locale === "ja" ? contentJa(x.en) ?? x.en : x.en })),
      nextStep: corrections.length ? t("Review the corrections above, then try the scenario again.") : t("Try a harder scenario or speak your answers with the microphone."),
    };
  }

  async lookup() {
    return null;
  }
  async translate() {
    return null;
  }
  async speak() {
    return null;
  }
  async transcribe() {
    return null;
  }
}

const JAPANESE = /[぀-ヿ一-龯]/;

const YO_FORMS: Record<string, string> = {
  ser: "soy", estar: "estoy", tener: "tengo", querer: "quiero", ir: "voy", comer: "como", beber: "bebo",
  hablar: "hablo", vivir: "vivo", trabajar: "trabajo", necesitar: "necesito", pagar: "pago", viajar: "viajo",
};

/** A few high-value, deterministic error patterns for the offline tutor. Explanations follow the learner's language. */
export function detectCommonErrors(msg: string, locale: Locale = "en"): Correction[] {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const out: Correction[] = [];
  const lower = msg.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = lower.match(/\byo es\b/))) out.push({ original: m[0], corrected: "yo soy", explanation: t("With 'yo' (I), 'ser' becomes 'soy'.") });
  if ((m = lower.match(/\byo (ser|estar|tener|querer|ir|comer|beber|hablar|vivir|trabajar|necesitar|pagar|viajar)\b/)))
    out.push({ original: m[0], corrected: `yo ${YO_FORMS[m[1]]}`, explanation: t("Conjugate the verb for 'yo': {verb} → {form}.", { verb: m[1], form: YO_FORMS[m[1]] }) });
  if ((m = lower.match(/\bmi gusta\b/))) out.push({ original: m[0], corrected: "me gusta", explanation: t("'I like' is 'me gusta' (me, not mi).") });
  if ((m = lower.match(/\b(soy|es) (cansado|cansada|enfermo|enferma|triste|contento|contenta)\b/)))
    out.push({ original: m[0], corrected: `${m[1] === "soy" ? "estoy" : "está"} ${m[2]}`, explanation: t("Use 'estar' for temporary states and feelings.") });
  if (/\b(the|and|please|thank you|i want|i would)\b/.test(lower) || JAPANESE.test(msg))
    out.push({ original: msg.slice(0, 60), corrected: t("(try it in Spanish)"), explanation: t("Try saying it in Spanish — e.g. 'quiero…' (I want…), 'por favor', 'gracias'.") });
  return out.slice(0, 2);
}
