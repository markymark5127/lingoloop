/**
 * Offline content engine — used automatically when OPENAI_API_KEY is not configured.
 * It produces schema-valid, personalized content from templates and the learner's vocabulary,
 * so the full product loop (generation jobs, rendering, games, mastery) works without an API key.
 * It is clearly labelled in the UI as the offline engine; it is not a substitute for the LLM.
 */
import {
  type ConversationSummary,
  type Correction,
  StoryScript,
  type TutorTurn,
  VideoScript,
} from "@/lib/content/schemas";
import type { AIProvider, ChatTurnInput, GenerationContext, WordHint } from "./types";

const FALLBACK_NOUNS: WordHint[] = [
  { lemma: "naranja", translation: "orange", article: "la", emoji: "🍊", pos: "noun" },
  { lemma: "gato", translation: "cat", article: "el", emoji: "🐱", pos: "noun" },
  { lemma: "pan", translation: "bread", article: "el", emoji: "🍞", pos: "noun" },
  { lemma: "llave", translation: "key", article: "la", emoji: "🔑", pos: "noun" },
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

type Scene = { text: string; translation: string; emoji: string; bg: VideoScript["body"]["scenes"][number]["bg"] };

const VIDEO_TEMPLATES: Record<string, (a: WordHint, b: WordHint) => { title: string; summary: string; scenes: Scene[]; q: [string, string[], number][] }> = {
  comedy: (a, b) => ({
    title: `¡${cap(a.lemma)} misteriosa!`,
    summary: `A hungry dog finds a ${a.translation} — and a surprise.`,
    scenes: [
      { text: "Hoy Max tiene mucha hambre.", translation: "Today Max is very hungry.", emoji: "🐶", bg: "candy" },
      { text: `En la cocina hay ${indef(a)}.`, translation: `In the kitchen there is a ${a.translation}.`, emoji: a.emoji ?? "🍽️", bg: "sunset" },
      { text: `Max quiere comer ${def(a)}.`, translation: `Max wants to eat the ${a.translation}.`, emoji: `🐶${a.emoji ?? ""}`, bg: "candy" },
      { text: `Pero ${def(b)} se mueve. ¡Qué susto!`, translation: `But the ${b.translation} moves. What a fright!`, emoji: `${b.emoji ?? "❓"}😱`, bg: "night" },
      { text: "Max corre al jardín. ¡Adiós, cocina!", translation: "Max runs to the garden. Bye, kitchen!", emoji: "🏃🌳", bg: "forest" },
    ],
    q: [
      ["What is in the kitchen?", [`A ${a.translation}`, "A shoe", "A phone"], 0],
      ["Why does Max run away?", ["He is tired", `The ${b.translation} moves`, "It is raining"], 1],
    ],
  }),
  mystery: (a, b) => ({
    title: `El caso de ${def(a)}`,
    summary: `A detective investigates a missing ${a.translation}.`,
    scenes: [
      { text: "Es de noche. La detective Ana llega a la casa.", translation: "It's night. Detective Ana arrives at the house.", emoji: "🕵️‍♀️🏠", bg: "night" },
      { text: `¡${Def(a)} no está! ¿Dónde está?`, translation: `The ${a.translation} isn't here! Where is it?`, emoji: a.emoji ?? "❓", bg: "night" },
      { text: `En la mesa hay ${indef(b)}.`, translation: `On the table there is a ${b.translation}.`, emoji: b.emoji ?? "🔎", bg: "city" },
      { text: "Ana mira al gato. El gato mira a Ana.", translation: "Ana looks at the cat. The cat looks at Ana.", emoji: "🐱👀", bg: "night" },
      { text: `¡El gato tiene ${def(a)}! Caso cerrado.`, translation: `The cat has the ${a.translation}! Case closed.`, emoji: `😼${a.emoji ?? ""}`, bg: "sunset" },
    ],
    q: [
      ["What is missing?", ["The car", `The ${a.translation}`, "The detective"], 1],
      ["Who had it?", ["The cat", "Ana", "Nobody"], 0],
    ],
  }),
  "sci-fi": (a, b) => ({
    title: `Un robot y ${indef(a)}`,
    summary: `A robot on Mars discovers a ${a.translation}.`,
    scenes: [
      { text: "Soy Robi, un robot en Marte.", translation: "I'm Robi, a robot on Mars.", emoji: "🤖🪐", bg: "space" },
      { text: `Hoy encuentro ${indef(a)} en la arena roja.`, translation: `Today I find a ${a.translation} in the red sand.`, emoji: a.emoji ?? "✨", bg: "desert" },
      { text: `¿Qué es? No es ${indef(b)}.`, translation: `What is it? It's not a ${b.translation}.`, emoji: "🤔", bg: "space" },
      { text: "Llamo a la Tierra: ¡hay vida en Marte!", translation: "I call Earth: there is life on Mars!", emoji: "📡🌍", bg: "space" },
      { text: `Pero... es mi ${a.lemma} del almuerzo.`, translation: `But... it's my ${a.translation} from lunch.`, emoji: "🤖😅", bg: "sunset" },
    ],
    q: [
      ["Where is Robi?", ["On the Moon", "On Mars", "In Madrid"], 1],
      ["What was the discovery really?", ["Alien life", "His lunch", "A new planet"], 1],
    ],
  }),
  travel: (a, b) => ({
    title: "Mi primer día en Sevilla",
    summary: `A traveler explores Seville and buys a ${a.translation}.`,
    scenes: [
      { text: "¡Hola! Hoy estoy en Sevilla.", translation: "Hi! Today I'm in Seville.", emoji: "🧳🇪🇸", bg: "sunset" },
      { text: "Hace mucho sol y calor.", translation: "It's very sunny and hot.", emoji: "☀️🥵", bg: "desert" },
      { text: `En el mercado compro ${indef(a)}.`, translation: `At the market I buy a ${a.translation}.`, emoji: a.emoji ?? "🛍️", bg: "city" },
      { text: `También veo ${indef(b)} muy bonito.`, translation: `I also see a very pretty ${b.translation}.`, emoji: b.emoji ?? "👀", bg: "city" },
      { text: "Por la noche, ¡flamenco!", translation: "At night, flamenco!", emoji: "💃🎶", bg: "night" },
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

function toQuestions(q: [string, string[], number][]) {
  return q.map(([question, options, answer]) => ({ q: question, options, answer }));
}

export class OfflineProvider implements AIProvider {
  readonly name = "offline" as const;

  async generateVideo(ctx: GenerationContext) {
    const [a, b] = nouns(ctx);
    const tpl = (VIDEO_TEMPLATES[ctx.genre] ?? VIDEO_TEMPLATES.comedy)(a, b);
    return VideoScript.parse({
      title: tpl.title,
      summary: tpl.summary,
      genre: VIDEO_TEMPLATES[ctx.genre] ? ctx.genre : "comedy",
      body: { scenes: tpl.scenes, questions: toQuestions(tpl.q) },
    });
  }

  async generateStory(ctx: GenerationContext) {
    const [a, b, c] = nouns(ctx);
    const hero = ctx.series?.characters[0] ?? "Clara";
    const title = ctx.series ? `${ctx.series.title}: un nuevo día` : `${hero} y ${def(a)}`;
    return StoryScript.parse({
      title,
      summary: `${hero} has an unexpected day involving a ${a.translation}.`,
      genre: ctx.genre in VIDEO_TEMPLATES ? ctx.genre : "everyday",
      body: {
        characters: [hero, "Tomás"],
        chapters: [
          {
            title: "Una mañana diferente",
            paragraphs: [
              { es: `${hero} vive en una casa pequeña. Cada mañana, ${hero} bebe café y come pan.`, en: `${hero} lives in a small house. Every morning, ${hero} drinks coffee and eats bread.` },
              { es: `Hoy, en la mesa, hay ${indef(a)}. ${hero} no sabe de dónde es.`, en: `Today, on the table, there is a ${a.translation}. ${hero} doesn't know where it is from.` },
              { es: `Su amigo Tomás llega con ${indef(b)}. "¿Es tuyo?", pregunta ${hero}. "No", dice Tomás.`, en: `Her friend Tomás arrives with a ${b.translation}. "Is it yours?", asks ${hero}. "No," says Tomás.` },
              { es: `Debajo de ${def(a)} hay una nota: "Busca ${def(c)}". ¿Quién escribe la nota?`, en: `Under the ${a.translation} there is a note: "Look for the ${c.translation}." Who writes the note?` },
            ],
            questions: [
              { q: `What is on the table?`, options: [`A ${a.translation}`, "A dog", "A book"], answer: 0 },
              { q: "What does the note say?", options: ["Go home", `Look for the ${c.translation}`, "Drink coffee"], answer: 1 },
            ],
          },
        ],
      },
    });
  }

  async chat(input: ChatTurnInput): Promise<TutorTurn> {
    const s = input.scenario;
    const msg = input.userMessage;
    const turn = s.turns[Math.min(input.turnIndex, s.turns.length - 1)];
    const ack = /gracias/i.test(msg) ? { es: "¡De nada! ", en: "You're welcome! " } : /\?/.test(msg) ? { es: "¡Buena pregunta! ", en: "Good question! " } : { es: "", en: "" };
    return { reply: ack.es + turn.es, translation: ack.en + turn.en, corrections: detectCommonErrors(msg) };
  }

  async summarize(input: { scenario: { title: string; goal: string; turns?: { es: string; en: string }[] }; level: string; transcript: { role: string; content: string; corrections?: unknown }[] }): Promise<ConversationSummary> {
    const userMsgs = input.transcript.filter((m) => m.role === "user");
    const corrections = input.transcript.flatMap((m) => (Array.isArray(m.corrections) ? (m.corrections as Correction[]) : [])).slice(0, 5);
    const spanishish = userMsgs.filter((m) => !/\b(the|and|i|you|is)\b/i.test(m.content)).length;
    return {
      overview: `You exchanged ${userMsgs.length} messages in "${input.scenario.title}". Goal: ${input.scenario.goal}.`,
      strengths: [
        spanishish > 0 ? `${spanishish} of your messages were fully in Spanish` : "You kept the conversation going",
        ...(corrections.length === 0 ? ["No major errors noticed — nice work!"] : []),
      ],
      corrections,
      usefulPhrases: (input.scenario.turns ?? []).slice(0, 3).map((t) => ({ es: t.es, en: t.en })),
      nextStep: corrections.length ? "Review the corrections above, then try the scenario again." : "Try a harder scenario or speak your answers with the microphone.",
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

const YO_FORMS: Record<string, string> = {
  ser: "soy", estar: "estoy", tener: "tengo", querer: "quiero", ir: "voy", comer: "como", beber: "bebo",
  hablar: "hablo", vivir: "vivo", trabajar: "trabajo", necesitar: "necesito", pagar: "pago", viajar: "viajo",
};

/** A few high-value, deterministic error patterns for the offline tutor. */
export function detectCommonErrors(msg: string): Correction[] {
  const out: Correction[] = [];
  const lower = msg.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = lower.match(/\byo es\b/))) out.push({ original: m[0], corrected: "yo soy", explanation: "With 'yo' (I), 'ser' becomes 'soy'." });
  if ((m = lower.match(/\byo (ser|estar|tener|querer|ir|comer|beber|hablar|vivir|trabajar|necesitar|pagar|viajar)\b/)))
    out.push({ original: m[0], corrected: `yo ${YO_FORMS[m[1]]}`, explanation: `Conjugate the verb for 'yo': ${m[1]} → ${YO_FORMS[m[1]]}.` });
  if ((m = lower.match(/\bmi gusta\b/))) out.push({ original: m[0], corrected: "me gusta", explanation: "'I like' is 'me gusta' (me, not mi)." });
  if ((m = lower.match(/\b(soy|es) (cansado|cansada|enfermo|enferma|triste|contento|contenta)\b/)))
    out.push({ original: m[0], corrected: `${m[1] === "soy" ? "estoy" : "está"} ${m[2]}`, explanation: "Use 'estar' for temporary states and feelings." });
  if (/\b(the|and|please|thank you|i want|i would)\b/.test(lower))
    out.push({ original: msg.slice(0, 60), corrected: "(try it in Spanish)", explanation: "Try saying it in Spanish — e.g. 'quiero…' (I want…), 'por favor', 'gracias'." });
  return out.slice(0, 2);
}
