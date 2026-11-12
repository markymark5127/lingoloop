/**
 * Speech synthesis is paid per character, and learners replay the same sentences constantly
 * (story narration, chat replies, word audio). Each distinct (model, voice, text) is synthesized
 * once, stored in Supabase Storage, and served from there afterwards — for every user.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "./types";
import { displayText, type TargetLang } from "@/lib/lang";

const BUCKET = "media";
export const ttsVoiceKey = () => `${process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts"}|${process.env.OPENAI_TTS_VOICE || "coral"}`;

export function ttsHash(text: string, voice = ttsVoiceKey()) {
  return createHash("sha256").update(`${voice}|${text.trim()}`).digest("hex");
}

/** Returns mp3 bytes (cached or freshly synthesized), or null when the provider has no TTS. */
export async function cachedSpeak(db: SupabaseClient, ai: AIProvider, rawText: string, lang: TargetLang = "es"): Promise<{ audio: Buffer; cached: boolean } | null> {
  if (ai.name === "offline") return null; // no server TTS; the browser voice / espeak-ng is used
  const text = displayText(rawText);
  // Spanish keys stay as before so existing cached audio keeps hitting.
  const voice = lang === "es" ? ttsVoiceKey() : `${ttsVoiceKey()}|${lang}`;
  const hash = ttsHash(text, voice);
  const path = `tts/${hash.slice(0, 2)}/${hash}.mp3`;

  const { data: row } = await db.from("tts_cache").select("storage_path, hits").eq("hash", hash).maybeSingle();
  if (row) {
    const { data: blob } = await db.storage.from(BUCKET).download(row.storage_path);
    if (blob) {
      void db.from("tts_cache").update({ hits: (row.hits ?? 0) + 1, last_hit_at: new Date().toISOString() }).eq("hash", hash).then(() => {});
      return { audio: Buffer.from(await blob.arrayBuffer()), cached: true };
    }
  }

  const audio = await ai.speak(text, lang);
  if (!audio) return null;
  const { error } = await db.storage.from(BUCKET).upload(path, audio, { contentType: "audio/mpeg", upsert: true });
  if (!error) {
    await db.from("tts_cache").upsert({ hash, text: text.trim().slice(0, 2000), voice, storage_path: path, bytes: audio.length }, { onConflict: "hash" });
  }
  return { audio, cached: false };
}
