import { z } from "zod";
import { route, requireUser, parseJson, rateLimit } from "@/lib/api/http";
import { ai } from "@/lib/ai";
import { cachedSpeak } from "@/lib/ai/tts-cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TARGET_LANGUAGES, langOfText } from "@/lib/lang";

const Body = z.object({ text: z.string().trim().min(1).max(600), lang: z.enum(TARGET_LANGUAGES).optional() });

/**
 * Text-to-speech, cached across all users (see tts-cache). Returns audio/mpeg, or 204 when no TTS
 * provider is configured (the client then uses the browser's voice for the target language).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`tts:${user.id}`, 40);
  const { text, lang } = await parseJson(req, Body);
  const r = await cachedSpeak(supabaseAdmin(), ai(), text, lang ?? langOfText(text));
  if (!r) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(r.audio), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=604800", "X-TTS-Cache": r.cached ? "hit" : "miss" },
  });
});
