import OpenAI from "openai";
import type { ZodType } from "zod";
import {
  ConversationSummary,
  GENRES,
  SCENE_BACKGROUNDS,
  StoryScript,
  TutorTurn,
  VideoScript,
  checkTargetText,
} from "@/lib/content/schemas";
import type { AIProvider, ChatTurnInput, GenerationContext, Lookup } from "./types";
import { LANGUAGE_NAME, toLocale } from "@/lib/i18n/core";
import { TARGET_INFO, displayText, type TargetLang } from "@/lib/lang";

/** Translations for every supported learner language are generated once, with the content, so
 * the same stored item can be shared by English- and Japanese-speaking learners. */
const BILINGUAL = `Every translation field comes in two languages: English in the base field and natural Japanese in the matching *_ja field (or "ja" for paragraphs). Japanese should be natural, polite (です・ます), and concise.`;
const langName = (l: string) => LANGUAGE_NAME[toLocale(l)];
const targetName = (l?: TargetLang) => TARGET_INFO[l ?? "es"].name;

/** How Japanese target text must be written so the app can tap words and show readings. */
const JA_FORMAT = `Japanese formatting (required):
- Write natural Japanese in kanji + kana suited to the level (A1–A2: mostly kana with only very common kanji).
- Put ONE space between every word and every particle, and before punctuation, e.g. "猫 は ベッド で 寝ています 。". Keep verb endings attached to the verb (寝ています, 食べました).
- Every Japanese text field has a matching "reading": the same text in hiragana/katakana with EXACTLY the same spaces (same number of words), e.g. "ねこ は ベッド で ねています 。".
- Translations are English only.`;

/**
 * Native-speaker style guide. The target-language text must sound like something a real person
 * would say or write, never a textbook sentence or a translation from English. Simple ≠ stilted:
 * an A1 line can be short AND natural.
 */
const NATIVE: Record<TargetLang, string> = {
  ja: `Write Japanese the way native speakers in Japan actually talk and write today — never translated-from-English Japanese, never textbook drills.
- Think in Japanese first; don't build the sentence from English. Do not translate idioms literally.
- Drop pronouns and topics that are obvious from context: no 私は / あなたは / 彼は / 彼女は at the start of every sentence.
- Pick the register a real person would use in the situation: casual speech (だ・よ・ね・の・じゃん, contractions like てる / ちゃう / なきゃ) between friends and family and in inner monologue; plain-form narration (た / ている) in stories; です・ます only where a real speaker would use it (shop staff, strangers, polite narration). Customer-service lines use real service Japanese (いらっしゃいませ, 〜になります, 少々お待ちください).
- Use natural sentence-final particles, fillers and reactions (ね, よ, かな, あれ？, えっ, うわ, やばい, なるほど) where they fit — sparingly.
- Use real collocations (鳥が鳴く not 鳥が歌う, 電話が鳴る, 雨が降る, 写真を撮る) and counters (一つ, 一杯, 一個, 一枚, 一人).
- Avoid textbook tells: "Xは Yです" chains, あなた to address people (use names or omit), 彼/彼女 for people you know, overusing とても (use すごく / めっちゃ / かなり / 本当に where natural), unnatural 〜しましょう lists.
- Keep it comprehensible for the level by using common words and short sentences, not by making the Japanese unnatural.`,
  es: `Write Spanish the way native speakers actually talk and write today — never translated-from-English Spanish, never textbook drills.
- Think in Spanish first. Avoid calques and false friends (realizar ≠ realize, "tener un buen tiempo", "aplicar para"); use real idioms and collocations (hacer una foto/sacar una foto, tener hambre, echar de menos, quedar con alguien).
- Drop subject pronouns unless they add emphasis or contrast (Voy a la playa, not Yo voy a la playa).
- Use the register a real person would use: tú between friends, usted with strangers in formal service; natural discourse markers (pues, bueno, oye, mira, ¿no?, vale/dale, venga, ¡qué…!) where they fit, sparingly.
- Prefer the tenses natives use: narrate stories in the past (pretérito/imperfecto), use ir a + infinitive for plans, present for near future when natural.
- Use natural word order and articles (Me encanta el café; ¿Me pones un café?), diminutives and exclamations where a native would.
- Use one consistent variety per piece (Spain or Latin America) and keep it natural for that variety.
- Keep it comprehensible for the level with common words and short sentences — never by making the Spanish stilted.`,
};

/** Second pass: a native editor fixes anything that sounds translated or textbook-like. */
const REVIEW_ENABLED = process.env.AI_NATIVE_REVIEW !== "false";

const chunkCount = (s: string) => s.trim().split(/\s+/).length;
/** Problems if a Japanese text/reading pair doesn't line up word-for-word. */
function readingProblems(pairs: { text: string; reading?: string }[]): string[] {
  const bad = pairs.filter((p) => !p.reading || chunkCount(p.text) !== chunkCount(p.reading));
  if (!bad.length) return [];
  if (pairs.length && pairs.every((p) => chunkCount(p.text) === 1)) return ["Japanese text must have spaces between words"];
  return [`"reading" must have exactly the same word breaks as the Japanese text (e.g. "${bad[0].text}")`];
}

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
// Any OpenAI-compatible endpoint works for text (xAI, Google Gemini, DeepSeek, OpenRouter…).
// Audio (TTS / transcription) can use a different provider, defaulting to the same one.
const BASE_URL = process.env.OPENAI_BASE_URL?.trim() || undefined;
const AUDIO_KEY = process.env.OPENAI_AUDIO_API_KEY?.trim();
const AUDIO_BASE_URL = process.env.OPENAI_AUDIO_BASE_URL?.trim() || undefined;
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "coral";
const STT_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

// Optional separate provider for video script generation (defaults to the main client).
const GROK_KEY = process.env.GROK_API_KEY?.trim();
const GROK_BASE_URL = process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1";
const GROK_MODEL = process.env.GROK_MODEL || "grok-2-latest";

export class GenerationRejected extends Error {}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  private client: OpenAI;
  private audio: OpenAI;
  private videoClient: OpenAI;
  private videoModel: string;
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, baseURL: BASE_URL });
    this.audio = AUDIO_KEY || AUDIO_BASE_URL ? new OpenAI({ apiKey: AUDIO_KEY || apiKey, baseURL: AUDIO_BASE_URL }) : this.client;
    this.videoClient = GROK_KEY ? new OpenAI({ apiKey: GROK_KEY, baseURL: GROK_BASE_URL }) : this.client;
    this.videoModel = GROK_KEY ? GROK_MODEL : MODEL;
  }

  /** Ask for JSON, validate with zod, retry with the validation errors as feedback. */
  private async json<T>(system: string, user: string, schema: ZodType<T>, check?: (v: T) => string[], tries = 3, client = this.client, model = MODEL): Promise<T> {
    let feedback = "";
    let lastErr = "";
    for (let i = 0; i < tries; i++) {
      const res = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user + (feedback ? `\n\nYour previous answer was rejected: ${feedback}. Fix these problems.` : "") },
        ],
      });
      const text = res.choices[0]?.message?.content ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        feedback = "response was not valid JSON";
        continue;
      }
      const r = schema.safeParse(parsed);
      if (!r.success) {
        lastErr = r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).slice(0, 6).join("; ");
        feedback = `schema errors — ${lastErr}`;
        continue;
      }
      const problems = check?.(r.data) ?? [];
      if (problems.length) {
        feedback = problems.join("; ");
        lastErr = feedback;
        continue;
      }
      return r.data;
    }
    throw new GenerationRejected(`AI output failed validation: ${lastErr || feedback}`);
  }

  private contentBrief(ctx: GenerationContext) {
    return [
      ctx.language === "ja"
        ? `Learner level (CEFR band): ${ctx.level}. Learners speak English. Target language: Japanese.`
        : `Learner level (CEFR band): ${ctx.level}. Learners speak English or Japanese. Target language: Spanish.`,
      `Genre: ${ctx.genre}. Learner interests: ${ctx.interests.join(", ") || "general"}.`,
      ctx.focusWords.length ? `Naturally include these review words: ${ctx.focusWords.map((w) => `${w.lemma} (${w.translation})`).join(", ")}.` : "",
      ctx.knownWords.length ? `Lean mostly on vocabulary the learner already knows, e.g.: ${ctx.knownWords.slice(0, 60).join(", ")}.` : "",
      "Introduce at most 3-4 genuinely new words. Keep sentences short and natural for the level.",
      ctx.series ? `This continues the series "${ctx.series.title}" with characters ${ctx.series.characters.join(", ")}. Previously: ${ctx.series.previousSummary}` : "",
      ctx.feedback?.length ? `Avoid: ${ctx.feedback.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Native-editor pass: a second call, prompted as a native speaker, rewrites any line that sounds
   * translated, textbook-like or unnatural (same meaning, same level). Japanese readings are
   * re-checked; if the edit doesn't validate, the original lines are kept.
   */
  private async nativeReview(lang: TargetLang, level: string, lines: { text: string; reading?: string; en: string }[]) {
    if (!REVIEW_ENABLED || !lines.length) return lines;
    const { z } = await import("zod");
    const Line = z.object({ text: z.string().min(1), reading: z.string().optional(), en: z.string() });
    const schema = z.object({ lines: z.array(Line) });
    const name = targetName(lang);
    const system = `You are a native ${name} speaker and professional editor of graded readers. You receive lines written for ${level} learners.
For each line, ask: "Would a native speaker actually say or write this, in this situation?" If it sounds translated from English, textbook-like, stiff, or uses the wrong register, rewrite it the way a native would — same meaning and story, same level (common words, short), similar length. Leave lines that are already natural unchanged.
${NATIVE[lang]}
${lang === "ja" ? JA_FORMAT : ""}
Return JSON {"lines": [{"text": ${name} line${lang === "ja" ? ', "reading": kana reading with the same spaces' : ""}, "en": English translation matching your version}]} with exactly ${lines.length} lines in the same order.`;
    try {
      const out = await this.json(system, JSON.stringify({ lines }), schema, (r) => [
        ...(r.lines.length !== lines.length ? [`return exactly ${lines.length} lines`] : []),
        ...checkTargetText(r.lines.map((l) => l.text), level, lang).problems,
        ...(lang === "ja" ? readingProblems(r.lines) : []),
      ], 2);
      return out.lines;
    } catch {
      return lines;
    }
  }

  async generateVideo(ctx: GenerationContext) {
    const v = await this.draftVideo(ctx);
    const lang = ctx.language ?? "es";
    const ja = lang === "ja";
    const edited = await this.nativeReview(lang, ctx.level, v.body.scenes.map((s) => ({ text: s.text, ...(ja ? { reading: s.reading } : {}), en: s.translation })));
    v.body.scenes = v.body.scenes.map((s, i) => {
      const e = edited[i];
      if (!e || e.text === s.text) return s;
      // A changed Spanish line's Japanese translation is now stale: re-derive it from the new English.
      return { ...s, text: e.text, ...(ja ? { reading: e.reading } : {}), translation: e.en, ...(!ja && s.translation_ja ? { translation_ja: undefined } : {}) };
    });
    return v;
  }

  async generateStory(ctx: GenerationContext) {
    const st = await this.draftStory(ctx);
    const lang = ctx.language ?? "es";
    const ja = lang === "ja";
    for (const c of st.body.chapters) {
      const edited = await this.nativeReview(lang, ctx.level, c.paragraphs.map((p) => ({ text: p.es, ...(ja ? { reading: p.reading } : {}), en: p.en })));
      c.paragraphs = c.paragraphs.map((p, i) => {
        const e = edited[i];
        if (!e || e.text === p.es) return p;
        return { ...p, es: e.text, ...(ja ? { reading: e.reading } : {}), en: e.en, ...(!ja && p.ja ? { ja: undefined } : {}) };
      });
    }
    return st;
  }

  private draftVideo(ctx: GenerationContext) {
    if (ctx.language === "ja") {
      const system = `You write scripts for 20-45 second vertical short-form videos that teach Japanese through entertainment.
Return JSON: {"title": string (Japanese, catchy, no spaces), "summary": string (English, one sentence), "genre": one of ${JSON.stringify(GENRES)},
"body": {"scenes": [{"text": Japanese narration line (short at A1), "reading": kana reading, "translation": English, "emoji": 1-2 emoji illustrating the scene, "bg": one of ${JSON.stringify(SCENE_BACKGROUNDS)}}] (4-6 scenes),
"questions": [{"q": English comprehension question, "options": 3 short English options, "answer": index of correct option}] (2 questions)}}.
${NATIVE.ja}
${JA_FORMAT}
Narrate like a real Japanese short-form creator or storyteller would (vlog-style, reactions, plain or casual forms), not like a textbook.
Make it genuinely funny, surprising or intriguing — a mini story with a twist.`;
      return this.json(system, this.contentBrief(ctx), VideoScript, (v) => [
        ...checkTargetText(v.body.scenes.map((s) => s.text), ctx.level, "ja").problems,
        ...readingProblems(v.body.scenes),
      ], 3, this.videoClient, this.videoModel);
    }
    const system = `You write scripts for 20-45 second vertical short-form videos that teach Spanish through entertainment.
Return JSON: {"title": string (Spanish, catchy), "summary": string (English, one sentence), "genre": one of ${JSON.stringify(GENRES)},
"body": {"summary_ja": Japanese summary, "scenes": [{"text": Spanish narration line (max 12 words at A1), "translation": English, "translation_ja": Japanese, "emoji": 1-2 emoji illustrating the scene, "bg": one of ${JSON.stringify(SCENE_BACKGROUNDS)}}] (4-6 scenes),
"questions": [{"q": English comprehension question, "options": 3 short English options, "q_ja": the same question in Japanese, "options_ja": the same 3 options in Japanese in the same order, "answer": index of correct option}] (2 questions)}}.
${NATIVE.es}
${BILINGUAL}
Narrate like a real Spanish-speaking short-form creator or storyteller would, not like a textbook.
Make it genuinely funny, surprising or intriguing — a mini story with a twist.`;
    return this.json(system, this.contentBrief(ctx), VideoScript, (v) =>
      checkTargetText(v.body.scenes.map((s) => s.text), ctx.level).problems,
      3, this.videoClient, this.videoModel,
    );
  }

  private draftStory(ctx: GenerationContext) {
    if (ctx.language === "ja") {
      const system = `You write short serialized stories for Japanese learners.
Return JSON: {"title": Japanese title (no spaces), "summary": English one-sentence summary, "genre": one of ${JSON.stringify(GENRES)},
"body": {"characters": [names], "chapters": [{"title": Japanese chapter title (no spaces), "paragraphs": [{"es": Japanese paragraph (2-4 sentences), "reading": kana reading, "en": English translation}] (3-5 paragraphs),
"questions": [{"q": English comprehension question, "options": 3 English options, "answer": index}] (2-3 questions)}] (exactly 1 chapter)}}.
${NATIVE.ja}
${JA_FORMAT}
Narrate in natural plain-form Japanese (た / ている), the way Japanese graded readers and light novels do; dialogue sounds like real people talking.
Use recurring, memorable characters and end the chapter with a small hook.`;
      return this.json(system, this.contentBrief(ctx), StoryScript, (s) => {
        const paras = s.body.chapters.flatMap((c) => c.paragraphs);
        return [...checkTargetText(paras.map((p) => p.es), ctx.level, "ja").problems, ...readingProblems(paras.map((p) => ({ text: p.es, reading: p.reading })))];
      });
    }
    const system = `You write short serialized stories for Spanish learners.
Return JSON: {"title": Spanish title, "summary": English one-sentence summary, "genre": one of ${JSON.stringify(GENRES)},
"body": {"summary_ja": Japanese summary, "characters": [names], "chapters": [{"title": Spanish chapter title, "paragraphs": [{"es": Spanish paragraph (2-4 sentences), "en": English translation, "ja": Japanese translation}] (3-5 paragraphs),
"questions": [{"q": English comprehension question, "options": 3 English options, "q_ja": Japanese question, "options_ja": the same options in Japanese, same order, "answer": index}] (2-3 questions)}] (exactly 1 chapter)}}.
${NATIVE.es}
${BILINGUAL}
Narrate in the past tense like a real Spanish storyteller; dialogue sounds like real people talking.
Use recurring, memorable characters and end the chapter with a small hook.`;
    return this.json(system, this.contentBrief(ctx), StoryScript, (s) =>
      checkTargetText(s.body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)), ctx.level).problems,
    );
  }

  chat(input: ChatTurnInput) {
    const s = input.scenario;
    if (s.language === "ja") {
      const L = langName(input.nativeLanguage);
      const system = `You are ${s.character}, ${s.role}. Roleplay in Japanese with a ${input.level} learner whose native language is ${L}.
Scenario goal for the learner: ${s.goal}.
Rules:
- Stay in character. Reply in Japanese only, 1-2 short sentences appropriate for ${input.level}, then ask a question that moves the scenario forward.
- Talk exactly like a real ${s.role} in Japan would: the register they'd really use with this person (service Japanese for staff, casual for friends), natural reactions and set phrases.
${NATIVE.ja}
- Prioritise communication: do NOT correct the learner inside your reply. If they made a meaningful mistake, record it silently in "corrections" (max 2; ignore kanji-vs-kana choices).
- Use familiar words where possible${input.focusWords.length ? `, and try to use: ${input.focusWords.map((w) => w.lemma).join(", ")}` : ""}.
${JA_FORMAT}
Return JSON: {"reply": Japanese reply (word-spaced), "reading": its kana reading, "translation": ${L} translation of your reply, "corrections": [{"original": learner's phrase, "corrected": what a native speaker would naturally say, "explanation": short explanation written in ${L}}]}`;
      const history = input.history.slice(-12).map((m) => `${m.role === "user" ? "Learner" : s.character}: ${displayText(m.content)}`).join("\n");
      return this.json(system, `${history}\nLearner: ${input.userMessage}`, TutorTurn, (t) => readingProblems([{ text: t.reply, reading: t.reading }]));
    }
    const system = `You are ${s.character}, ${s.role}. Roleplay in Spanish with a ${input.level} learner whose native language is ${langName(input.nativeLanguage)}.
Scenario goal for the learner: ${s.goal}.
Rules:
- Stay in character. Reply in Spanish only, 1-2 short sentences appropriate for ${input.level}, then ask a question that moves the scenario forward.
- Talk exactly like a real ${s.role} would: the register they'd really use with this person, natural reactions and set phrases.
${NATIVE.es}
- Prioritise communication: do NOT correct the learner inside your reply. If they made a meaningful mistake, record it silently in "corrections" (max 2, skip trivial accent/typo issues at A1-A2).
- Use familiar words where possible${input.focusWords.length ? `, and try to use: ${input.focusWords.map((w) => w.lemma).join(", ")}` : ""}.
Return JSON: {"reply": Spanish reply, "translation": ${langName(input.nativeLanguage)} translation of your reply, "corrections": [{"original": learner's phrase, "corrected": what a native speaker would naturally say, "explanation": short explanation written in ${langName(input.nativeLanguage)}}]}`;
    const history = input.history.slice(-12).map((m) => `${m.role === "user" ? "Learner" : s.character}: ${m.content}`).join("\n");
    return this.json(system, `${history}\nLearner: ${input.userMessage}`, TutorTurn);
  }

  summarize(input: { scenario: { title: string; goal: string; language?: TargetLang }; level: string; nativeLanguage?: string; transcript: { role: string; content: string; corrections?: unknown }[] }) {
    const L = langName(input.nativeLanguage ?? "en");
    if (input.scenario.language === "ja") {
      const system = `You are a supportive Japanese tutor. Summarize a roleplay conversation for a ${input.level} learner whose native language is ${L}. Write all feedback in ${L}.
Return JSON: {"overview": ${L} 1-2 sentences, "strengths": [${L} bullet], "corrections": [{"original","corrected","explanation" (in ${L})}] (most important first, max 5),
"usefulPhrases": [{"es": Japanese phrase (word-spaced), "reading": its kana reading with the same spaces, "en": its ${L} translation}] (3-5 phrases they could use next time — what natives actually say in this situation), "nextStep": ${L} suggestion}.
Corrections should show what a native speaker would naturally say, not just what is grammatical.`;
      const t = input.transcript.map((m) => `${m.role}: ${displayText(m.content)}${m.corrections ? ` [noted: ${JSON.stringify(m.corrections)}]` : ""}`).join("\n");
      return this.json(system, `Scenario: ${input.scenario.title} — goal: ${input.scenario.goal}\n${t}`, ConversationSummary);
    }
    const system = `You are a supportive Spanish tutor. Summarize a roleplay conversation for a ${input.level} learner whose native language is ${L}. Write all feedback in ${L}.
Return JSON: {"overview": ${L} 1-2 sentences, "strengths": [${L} bullet], "corrections": [{"original","corrected","explanation" (in ${L})}] (most important first, max 5),
"usefulPhrases": [{"es": Spanish phrase, "en": its ${L} translation}] (3-5 phrases they could use next time — what natives actually say in this situation), "nextStep": ${L} suggestion}.
Corrections should show what a native speaker would naturally say, not just what is grammatical.`;
    const t = input.transcript.map((m) => `${m.role}: ${m.content}${m.corrections ? ` [noted: ${JSON.stringify(m.corrections)}]` : ""}`).join("\n");
    return this.json(system, `Scenario: ${input.scenario.title} — goal: ${input.scenario.goal}\n${t}`, ConversationSummary);
  }

  async lookup(word: string, sentence: string, nativeLanguage = "en", lang: TargetLang = "es"): Promise<Lookup | null> {
    const { z } = await import("zod");
    if (lang === "ja") {
      const schema = z.object({ lemma: z.string(), reading: z.string(), translation: z.string(), partOfSpeech: z.string() });
      try {
        return await this.json(
          `You are a Japanese-${langName(nativeLanguage)} learner's dictionary. Return JSON {"lemma": dictionary form in Japanese, "reading": its reading in hiragana, "translation": short ${langName(nativeLanguage)} meaning in this context, "partOfSpeech": noun|verb|adjective|adverb|particle|phrase|other}.`,
          `Word: "${word}"\nSentence: "${displayText(sentence)}"`,
          schema,
          undefined,
          2,
        );
      } catch {
        return null;
      }
    }
    const schema = z.object({ lemma: z.string(), translation: z.string(), partOfSpeech: z.string() });
    try {
      return await this.json(
        `You are a Spanish-${langName(nativeLanguage)} learner's dictionary. Return JSON {"lemma": dictionary form in Spanish, "translation": short ${langName(nativeLanguage)} meaning in this context, "partOfSpeech": noun|verb|adjective|adverb|phrase|other}.`,
        `Word: "${word}"\nSentence: "${sentence}"`,
        schema,
        undefined,
        2,
      );
    } catch {
      return null;
    }
  }

  async translate(text: string, lang: TargetLang = "es") {
    const res = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: `Translate the ${targetName(lang)} text to natural English. Reply with the translation only.` },
        { role: "user", content: displayText(text) },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? null;
  }

  async speak(text: string, lang: TargetLang = "es") {
    const res = await this.audio.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: displayText(text),
      response_format: "mp3",
      instructions: lang === "ja"
        ? "Speak natural standard Tokyo Japanese with correct pitch accent, like a native speaker, at a slightly slower, clear pace."
        : `Speak natural ${targetName(lang)} like a native speaker, warm and clear, at a slightly slower pace for a language learner.`,
    });
    return Buffer.from(await res.arrayBuffer());
  }

  async transcribe(audio: File, lang: TargetLang = "es") {
    const res = await this.audio.audio.transcriptions.create({ model: STT_MODEL, file: audio, language: lang });
    return res.text;
  }
}
