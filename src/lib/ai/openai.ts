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

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "coral";
const STT_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";

export class GenerationRejected extends Error {}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  private client: OpenAI;
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /** Ask for JSON, validate with zod, retry with the validation errors as feedback. */
  private async json<T>(system: string, user: string, schema: ZodType<T>, check?: (v: T) => string[], tries = 3): Promise<T> {
    let feedback = "";
    let lastErr = "";
    for (let i = 0; i < tries; i++) {
      const res = await this.client.chat.completions.create({
        model: MODEL,
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
      `Learner level (CEFR band): ${ctx.level}. Native language: English. Target language: Spanish.`,
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

  generateVideo(ctx: GenerationContext) {
    const system = `You write scripts for 20-45 second vertical short-form videos that teach Spanish through entertainment.
Return JSON: {"title": string (Spanish, catchy), "summary": string (English, one sentence), "genre": one of ${JSON.stringify(GENRES)},
"body": {"scenes": [{"text": Spanish narration line (max 12 words at A1), "translation": English, "emoji": 1-2 emoji illustrating the scene, "bg": one of ${JSON.stringify(SCENE_BACKGROUNDS)}}] (4-6 scenes),
"questions": [{"q": English comprehension question, "options": 3 short English options, "answer": index of correct option}] (2 questions)}}.
Make it genuinely funny, surprising or intriguing — a mini story with a twist.`;
    return this.json(system, this.contentBrief(ctx), VideoScript, (v) =>
      checkTargetText(v.body.scenes.map((s) => s.text), ctx.level).problems,
    );
  }

  generateStory(ctx: GenerationContext) {
    const system = `You write short serialized stories for Spanish learners.
Return JSON: {"title": Spanish title, "summary": English one-sentence summary, "genre": one of ${JSON.stringify(GENRES)},
"body": {"characters": [names], "chapters": [{"title": Spanish chapter title, "paragraphs": [{"es": Spanish paragraph (2-4 sentences), "en": English translation}] (3-5 paragraphs),
"questions": [{"q": English comprehension question, "options": 3 English options, "answer": index}] (2-3 questions)}] (exactly 1 chapter)}}.
Use recurring, memorable characters and end the chapter with a small hook.`;
    return this.json(system, this.contentBrief(ctx), StoryScript, (s) =>
      checkTargetText(s.body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)), ctx.level).problems,
    );
  }

  chat(input: ChatTurnInput) {
    const s = input.scenario;
    const system = `You are ${s.character}, ${s.role}. Roleplay in Spanish with a ${input.level} learner whose native language is ${input.nativeLanguage === "en" ? "English" : input.nativeLanguage}.
Scenario goal for the learner: ${s.goal}.
Rules:
- Stay in character. Reply in Spanish only, 1-2 short sentences appropriate for ${input.level}, then ask a question that moves the scenario forward.
- Prioritise communication: do NOT correct the learner inside your reply. If they made a meaningful mistake, record it silently in "corrections" (max 2, skip trivial accent/typo issues at A1-A2).
- Use familiar words where possible${input.focusWords.length ? `, and try to use: ${input.focusWords.map((w) => w.lemma).join(", ")}` : ""}.
Return JSON: {"reply": Spanish reply, "translation": English translation of your reply, "corrections": [{"original": learner's phrase, "corrected": natural Spanish, "explanation": short English explanation}]}`;
    const history = input.history.slice(-12).map((m) => `${m.role === "user" ? "Learner" : s.character}: ${m.content}`).join("\n");
    return this.json(system, `${history}\nLearner: ${input.userMessage}`, TutorTurn);
  }

  summarize(input: { scenario: { title: string; goal: string }; level: string; transcript: { role: string; content: string; corrections?: unknown }[] }) {
    const system = `You are a supportive Spanish tutor. Summarize a roleplay conversation for a ${input.level} learner.
Return JSON: {"overview": English 1-2 sentences, "strengths": [English bullet], "corrections": [{"original","corrected","explanation"}] (most important first, max 5),
"usefulPhrases": [{"es","en"}] (3-5 phrases they could use next time), "nextStep": English suggestion}.`;
    const t = input.transcript.map((m) => `${m.role}: ${m.content}${m.corrections ? ` [noted: ${JSON.stringify(m.corrections)}]` : ""}`).join("\n");
    return this.json(system, `Scenario: ${input.scenario.title} — goal: ${input.scenario.goal}\n${t}`, ConversationSummary);
  }

  async lookup(word: string, sentence: string): Promise<Lookup | null> {
    const { z } = await import("zod");
    const schema = z.object({ lemma: z.string(), translation: z.string(), partOfSpeech: z.string() });
    try {
      return await this.json(
        "You are a Spanish-English dictionary. Return JSON {\"lemma\": dictionary form in Spanish, \"translation\": short English meaning in this context, \"partOfSpeech\": noun|verb|adjective|adverb|phrase|other}.",
        `Word: "${word}"\nSentence: "${sentence}"`,
        schema,
        undefined,
        2,
      );
    } catch {
      return null;
    }
  }

  async translate(text: string) {
    const res = await this.client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Translate the Spanish text to natural English. Reply with the translation only." },
        { role: "user", content: text },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? null;
  }

  async speak(text: string) {
    const res = await this.client.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      response_format: "mp3",
      instructions: "Speak in clear, warm, natural Spanish at a slightly slower pace for a language learner.",
    });
    return Buffer.from(await res.arrayBuffer());
  }

  async transcribe(audio: File) {
    const res = await this.client.audio.transcriptions.create({ model: STT_MODEL, file: audio, language: "es" });
    return res.text;
  }
}
