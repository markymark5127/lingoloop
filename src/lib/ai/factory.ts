// Non-"server-only" factory for the standalone worker process.
import type { AIProvider } from "./types";
import { OfflineProvider } from "./offline";
import { OpenAIProvider } from "./openai";

export function createProvider(): AIProvider {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? new OpenAIProvider(key) : new OfflineProvider();
}
