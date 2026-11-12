import "server-only";
import type { AIProvider } from "./types";
import { createProvider } from "./factory";

let provider: AIProvider | null = null;

/** The configured AI provider: OpenAI when OPENAI_API_KEY is set, otherwise the offline engine. */
export function ai(): AIProvider {
  if (!provider) {
    provider = createProvider();
  }
  return provider;
}

export function aiMode(): "openai" | "offline" {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "offline";
}

export type { AIProvider } from "./types";
