import { z } from "zod";
import { route, requireUser, parseJson, rateLimit } from "@/lib/api/http";
import { ai } from "@/lib/ai";

const Body = z.object({ text: z.string().trim().min(1).max(600) });

/** Text-to-speech. Returns audio/mpeg, or 204 when no TTS provider is configured (client then uses the browser voice). */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`tts:${user.id}`, 40);
  const { text } = await parseJson(req, Body);
  const audio = await ai().speak(text);
  if (!audio) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
});
