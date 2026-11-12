import { route, requireUser, rateLimit, HttpError } from "@/lib/api/http";
import { ai, aiMode } from "@/lib/ai";

const MAX_BYTES = 10 * 1024 * 1024;

/** Speech-to-text for recorded audio (multipart field "audio"). */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`stt:${user.id}`, 20);
  if (aiMode() === "offline") throw new HttpError(501, "Server transcription needs OPENAI_API_KEY; use browser speech recognition instead.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) throw new HttpError(400, "Missing audio file");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Recording too long");
  const text = await ai().transcribe(file);
  return { text: text ?? "" };
});
