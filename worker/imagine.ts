/**
 * Grok Imagine visuals: one AI-generated 9:16 clip per scene instead of the emoji scene cards.
 *
 *   VIDEO_VISUALS=imagine                       turn it on (otherwise emoji cards)
 *   IMAGINE_MODEL=grok-imagine-video-1.5-lite   video model
 *   IMAGINE_RESOLUTION=480p                     480p | 720p (cost is per second of video)
 *   IMAGINE_PLANNER_MODEL                       text model that writes the shot prompts (default GROK_MODEL)
 *   VIDEO_VOICE=imagine                         characters SPEAK the lines on camera (Grok Imagine audio,
 *                                               lip-synced) instead of a TTS voice-over
 *
 * A planner call first writes a shared visual style + character sheet and one shot prompt per
 * scene, so characters look the same from clip to clip. Clips are then generated in parallel.
 */
import OpenAI from "openai";
import { z } from "zod";
import { readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const BASE_URL = () => process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1";
const KEY = () => process.env.GROK_API_KEY?.trim();

export const imagineEnabled = () => process.env.VIDEO_VISUALS === "imagine";
export const imagineVoice = () => imagineEnabled() && process.env.VIDEO_VOICE === "imagine";

const LANGUAGE_NAME: Record<string, string> = { es: "Spanish", ja: "Japanese" };
const NO_CAPTIONS_PREFIX =
  "IMPORTANT: Do NOT add captions or subtitles. Do not display the spoken words as text. No on-screen text, no text overlays, no lyrics, no logos, no watermarks.";
const NO_TEXT = "Raw camera footage only: absolutely no subtitles, no captions, no burned-in text, no app interface, no logos or watermarks, no words or letters of any kind on screen.";

export function assertImagineConfigured() {
  if (!KEY()) throw new Error("VIDEO_VISUALS=imagine requires GROK_API_KEY");
}

const ShotPlan = z.object({
  style: z.string().min(1),
  characters: z.string(),
  shots: z.array(z.object({ visual: z.string().min(1), speaker: z.string().optional() })),
});

export interface ShotScene {
  /** the line in the target language, exactly as it must be spoken */
  line: string;
  translation: string;
  emoji: string;
}

/**
 * Ask Grok for a consistent look and one shot per scene. With `speaking`, each shot has a character
 * say the scene's line on camera, TikTok-style; the exact line is appended verbatim afterwards.
 */
export async function planShots(title: string, scenes: ShotScene[], opts: { speaking?: boolean; language?: string; genre?: string } = {}): Promise<string[]> {
  const client = new OpenAI({ apiKey: KEY(), baseURL: BASE_URL() });
  const model = process.env.IMAGINE_PLANNER_MODEL || process.env.GROK_MODEL || "grok-4.7";
  const lang = LANGUAGE_NAME[opts.language ?? "es"] ?? "Spanish";
  const system = opts.speaking
    ? `You are the director of a viral short-form vertical (9:16) ${opts.genre ?? ""} video for social media. Native ${lang} speakers appear on camera and SAY each scene's line out loud.
You receive the story as numbered scenes (the ${lang} line and its English meaning). Plan one short shot per scene.
Return JSON {"style": one visual style used for every shot (e.g. "handheld smartphone selfie footage, natural light, authentic and unpolished"),
"characters": a concrete visual description of each recurring character (age, look, clothing, colors) so they look identical in every shot,
"shots": [{"speaker": who says the line in this shot, described exactly as in "characters", "visual": 1-2 sentences: setting, action, expression and camera framing while they speak — do NOT write the line itself}]}.
Make it feel like a real viral short-form video: expressive faces, talking to the camera or to each other, reactions, quick energy. Friendly and safe for all ages.`
    : `You are the director of short vertical (9:16) social videos for language learners. You receive a mini story as numbered scenes.
Write prompts for an AI video generator, one short shot per scene.
Return JSON {"style": one visual style used for every shot (e.g. "bright, warm, cinematic smartphone footage, shallow depth of field"),
"characters": a concrete visual description of each recurring character/object (species/age, clothing, colors) so they look identical in every shot,
"shots": [{"visual": 1-3 sentences describing what we SEE (subject, action, setting, camera move), repeating the character descriptions verbatim. Vertical framing, subject centered.}]}.
Never include written text, captions, subtitles, signs, logos or speech bubbles in the frame. Keep it friendly and safe for all ages.`;
  const user = JSON.stringify({ title, scenes: scenes.map((s, i) => ({ n: i + 1, line: s.line, meaning: s.translation, mood: s.emoji })) });
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.chat.completions.create({
      model,
      // Shot planning doesn't need deep reasoning; grok-4.x defaults to "high", which is slow.
      ...({ reasoning_effort: "low" } as object),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user + feedback },
      ],
    });
    try {
      const plan = ShotPlan.parse(JSON.parse(res.choices[0]?.message?.content ?? ""));
      if (plan.shots.length !== scenes.length) throw new Error(`return exactly ${scenes.length} shots`);
      return plan.shots.map((shot, i) =>
        opts.speaking
          ? `Authentic handheld vertical 9:16 smartphone video, viral short-form style. ${shot.visual} ${shot.speaker ?? "The main character"} says clearly, in natural, casual native ${lang}: "${scenes[i].line}" ` +
            `Lip-synced speech, expressive delivery. Style: ${plan.style}. Characters: ${plan.characters}. ${NO_TEXT}`
          : `${shot.visual} Style: ${plan.style}. Characters: ${plan.characters}. Vertical 9:16 video. ${NO_TEXT}`,
      );
    } catch (e) {
      feedback = `\n\nYour previous answer was invalid (${(e as Error).message}). Return valid JSON exactly as specified.`;
    }
  }
  throw new Error("Grok shot planner returned invalid JSON 3 times");
}

/** Rough seconds needed to say a line naturally (plus a beat before/after). */
export function speakingSeconds(line: string, language: string) {
  const units = language === "ja" ? [...line.replace(/\s/g, "")].length / 7 : line.split(/\s+/).filter(Boolean).length / 2.6;
  return Math.min(10, Math.max(3, Math.ceil(units + 1.5)));
}

interface VideoStatus {
  status: string;
  video?: { url: string; duration: number };
  error?: string | { message?: string };
}

/** Generate one 9:16 clip and save it to `outFile`. Returns the clip's duration in seconds. */
export async function generateClip(prompt: string, seconds: number, outFile: string): Promise<number> {
  const headers = { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" };
  const duration = Math.min(15, Math.max(3, Math.ceil(seconds)));
  const start = await fetch(`${BASE_URL()}/videos/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.IMAGINE_MODEL || "grok-imagine-video-1.5-lite",
      // Said up front (models weight the start of a prompt most) as well as in the shot text.
      prompt: `${NO_CAPTIONS_PREFIX} ${prompt}`,
      aspect_ratio: "9:16",
      duration,
      resolution: process.env.IMAGINE_RESOLUTION || "480p",
    }),
  });
  const started = (await start.json().catch(() => ({}))) as { request_id?: string; error?: string };
  if (!start.ok || !started.request_id) throw new Error(`Grok Imagine request failed (HTTP ${start.status}): ${started.error ?? JSON.stringify(started)}`);

  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`${BASE_URL()}/videos/${started.request_id}`, { headers });
    if (!poll.ok) continue; // transient; keep polling until the deadline
    const s = (await poll.json()) as VideoStatus;
    if (s.status === "done" && s.video?.url) {
      const file = await fetch(s.video.url);
      if (!file.ok) throw new Error(`Grok Imagine download failed (HTTP ${file.status})`);
      await writeFile(outFile, Buffer.from(await file.arrayBuffer()));
      return s.video.duration ?? duration;
    }
    if (s.status === "failed" || s.status === "expired") {
      const msg = typeof s.error === "string" ? s.error : s.error?.message;
      throw new Error(`Grok Imagine ${s.status}${msg ? `: ${msg}` : ""}`);
    }
  }
  throw new Error(`Grok Imagine timed out (request ${started.request_id})`);
}

/**
 * Grok Imagine sometimes burns subtitles into the clip even when told not to. The app draws its own
 * tap-to-translate captions, so show Grok two frames and ask whether there's on-screen text.
 */
export async function hasBurnedInText(file: string): Promise<boolean> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const dur = parseFloat(stdout) || 3;
  const images: string[] = [];
  for (const at of [0.45, 0.85]) {
    const jpg = `${file}.${at}.jpg`;
    await run("ffmpeg", ["-v", "error", "-y", "-ss", (dur * at).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=360:-1", jpg]);
    images.push((await readFile(jpg)).toString("base64"));
    await rm(jpg, { force: true });
  }
  const client = new OpenAI({ apiKey: KEY(), baseURL: BASE_URL() });
  const res = await client.chat.completions.create({
    model: process.env.IMAGINE_PLANNER_MODEL || process.env.GROK_MODEL || "grok-4.7",
    ...({ reasoning_effort: "low" } as object),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: 'Do these video frames contain any overlay added on top of the footage: subtitles, captions, other written text, a watermark, a logo (for example a TikTok logo) or app interface elements? Ignore text that is naturally part of the scene, like shop signs or a phone screen. Answer JSON {"subtitles": true|false}.' },
          ...images.map((b64) => ({ type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${b64}` } })),
        ],
      },
    ],
  });
  try {
    return JSON.parse(res.choices[0]?.message?.content ?? "{}").subtitles === true;
  } catch {
    return false;
  }
}

/**
 * Quoting the line inline ("…says: "line"") seems to nudge the model into printing it on screen.
 * So the dialogue goes into a separate audio-only instruction instead.
 */
export function audioOnlyVariant(prompt: string) {
  const marker = " says clearly, in natural, casual native ";
  const at = prompt.indexOf(marker);
  const open = at < 0 ? -1 : prompt.indexOf(': "', at);
  const close = open < 0 ? -1 : prompt.indexOf('"', open + 3);
  if (close < 0) return `${prompt} The picture must be clean camera footage with no text overlays at all.`;
  const sentenceStart = prompt.lastIndexOf(". ", at) + 2; // speaker is the start of that sentence
  const speaker = prompt.slice(sentenceStart, at);
  const lang = prompt.slice(at + marker.length, open);
  const line = prompt.slice(open + 3, close);
  const before = prompt.slice(0, sentenceStart).trim();
  const after = prompt.slice(close + 1).trim();
  return `${before} ${after} The picture is clean camera footage with no text overlays at all. ` +
    `AUDIO ONLY (spoken, never written on screen): ${speaker} speaks this line aloud in natural native ${lang}, lip-synced: ${line}`;
}

/**
 * generateClip with one retry when the result has burned-in subtitles/watermarks. Speaking clips
 * often get captions anyway; the app's caption box covers that band, so more retries aren't worth it.
 */
export async function generateCleanClip(prompt: string, seconds: number, outFile: string): Promise<number> {
  const attempts = Number(process.env.IMAGINE_MAX_ATTEMPTS ?? 2);
  let dur = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    dur = await generateClip(attempt === 1 ? audioOnlyVariant(prompt) : `${audioOnlyVariant(prompt)} Do not show any words on screen.`, seconds, outFile);
    const text = await hasBurnedInText(outFile).catch(() => false);
    if (!text) return dur;
    console.warn(`[imagine] clip has burned-in subtitles/watermark (attempt ${attempt}/${attempts})${attempt < attempts ? ", regenerating" : ", keeping it"}`);
  }
  return dur;
}
