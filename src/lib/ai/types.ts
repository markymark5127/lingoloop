import type { ConversationSummary, StoryScript, TutorTurn, VideoScript } from "@/lib/content/schemas";
import type { Scenario } from "@/lib/content/scenarios";

export interface WordHint {
  lemma: string;
  translation: string;
  article?: string | null;
  emoji?: string | null;
  pos?: string;
}

export interface GenerationContext {
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
}

export interface AIProvider {
  readonly name: "openai" | "offline";
  generateVideo(ctx: GenerationContext): Promise<VideoScript>;
  generateStory(ctx: GenerationContext): Promise<StoryScript>;
  chat(input: ChatTurnInput): Promise<TutorTurn>;
  summarize(input: { scenario: Scenario; level: string; transcript: { role: string; content: string; corrections?: unknown }[] }): Promise<ConversationSummary>;
  lookup(word: string, sentence: string): Promise<Lookup | null>;
  translate(text: string): Promise<string | null>;
  /** returns audio bytes (mp3) or null if unsupported */
  speak(text: string): Promise<Buffer | null>;
  transcribe(audio: File): Promise<string | null>;
}
