import type { ConversationSummary, StoryScript, TutorTurn, VideoScript } from "@/lib/content/schemas";
import type { Scenario } from "@/lib/content/scenarios";
import type { TargetLang } from "@/lib/lang";

export interface WordHint {
  lemma: string;
  /** Japanese: kana reading */
  reading?: string | null;
  translation: string;
  translation_ja?: string | null;
  article?: string | null;
  emoji?: string | null;
  pos?: string;
}

export interface GenerationContext {
  /** language being learned (defaults to Spanish) */
  language?: TargetLang;
  level: string;
  genre: string;
  interests: string[];
  /** words due for review / weak — should be woven in */
  focusWords: WordHint[];
  /** familiar vocabulary to lean on */
  knownWords: string[];
  /** continue a series */
  series?: { title: string; characters: string[]; previousSummary: string };
  /** extra guidance after a failed validation */
  feedback?: string[];
}

export interface ChatTurnInput {
  scenario: Scenario;
  level: string;
  nativeLanguage: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  knownWords: string[];
  focusWords: WordHint[];
  turnIndex: number;
}

export interface Lookup {
  lemma: string;
  translation: string;
  partOfSpeech: string;
  reading?: string;
}

export interface AIProvider {
  readonly name: "openai" | "offline";
  generateVideo(ctx: GenerationContext): Promise<VideoScript>;
  generateStory(ctx: GenerationContext): Promise<StoryScript>;
  chat(input: ChatTurnInput): Promise<TutorTurn>;
  summarize(input: { scenario: Scenario; level: string; nativeLanguage?: string; transcript: { role: string; content: string; corrections?: unknown }[] }): Promise<ConversationSummary>;
  lookup(word: string, sentence: string, nativeLanguage?: string, lang?: TargetLang): Promise<Lookup | null>;
  translate(text: string, lang?: TargetLang): Promise<string | null>;
  /** returns audio bytes (mp3) or null if unsupported */
  speak(text: string, lang?: TargetLang): Promise<Buffer | null>;
  transcribe(audio: File, lang?: TargetLang): Promise<string | null>;
}
