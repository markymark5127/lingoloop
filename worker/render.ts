/**
 * Video renderer: script -> narration audio + scene frames -> 9:16 MP4 + WebVTT captions.
 *
 * - Narration: OpenAI TTS when configured, otherwise espeak-ng (local, offline).
 * - Frames: scene cards rendered as HTML in headless Chromium (Playwright) at 1080x1920.
 * - Composition: ffmpeg with a slow Ken Burns zoom per scene, concatenated with audio.
 * Exact per-scene timings come from the measured audio, so captions sync precisely.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import type { VideoBody } from "../src/lib/content/schemas";
import type { AIProvider } from "../src/lib/ai/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedSpeak } from "../src/lib/ai/tts-cache";
import { TARGET_INFO, collapse, displayText, type TargetLang } from "../src/lib/lang";

const run = promisify(execFile);
const W = 1080;
const H = 1920;
const FPS = 30;
const PAD = 0.45; // seconds of breathing room after each line

const BACKGROUNDS: Record<string, [string, string]> = {
  sunset: ["#ff7e5f", "#feb47b"],
  ocean: ["#2193b0", "#6dd5ed"],
  forest: ["#134e5e", "#71b280"],
  night: ["#0f2027", "#2c5364"],
  candy: ["#ee9ca7", "#ffdde1"],
  desert: ["#c94b4b", "#f0a868"],
  city: ["#373b44", "#4286f4"],
  space: ["#000428", "#004e92"],
};

let browser: Browser | null = null;
async function getBrowser() {
  if (!browser) browser = await chromium.launch();
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

function sceneHtml(scene: VideoBody["scenes"][number], title: string, index: number, total: number, lang: TargetLang) {
  const [a, b] = BACKGROUNDS[scene.bg] ?? BACKGROUNDS.sunset;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;font-family:"Noto Sans","Noto Sans CJK JP","DejaVu Sans",sans-serif;
    background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.35), transparent 45%), linear-gradient(160deg, ${a}, ${b});
    display:flex;flex-direction:column;align-items:center;color:white}
  .top{margin-top:120px;font-size:38px;font-weight:700;letter-spacing:.08em;opacity:.85;text-transform:uppercase}
  .title{margin-top:18px;font-size:64px;font-weight:800;text-align:center;padding:0 80px;text-shadow:0 4px 24px rgba(0,0,0,.25)}
  .emoji{flex:1;display:flex;align-items:center;justify-content:center;font-size:${scene.emoji.length > 3 ? 300 : 420}px;
    font-family:"Noto Color Emoji",sans-serif;filter:drop-shadow(0 30px 40px rgba(0,0,0,.3))}
  .dots{display:flex;gap:14px;margin-bottom:560px}
  .dot{width:18px;height:18px;border-radius:9px;background:rgba(255,255,255,.4)}
  .dot.on{background:white;width:48px}
  </style></head><body>
  <div class="top">LingoLoop · ${TARGET_INFO[lang].endonym}</div>
  <div class="title">${esc(title)}</div>
  <div class="emoji">${esc(scene.emoji)}</div>
  <div class="dots">${Array.from({ length: total }, (_, i) => `<div class="dot ${i === index ? "on" : ""}"></div>`).join("")}</div>
  </body></html>`;
}

async function probeDuration(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return parseFloat(stdout.trim());
}

async function narrate(ai: AIProvider, scene: { text: string; reading?: string }, lang: TargetLang, outBase: string, db?: SupabaseClient): Promise<string> {
  const text = displayText(scene.text);
  try {
    // Reuse narration across videos/users: the same sentence is only ever synthesized once.
    const mp3 = db ? (await cachedSpeak(db, ai, text, lang))?.audio : await ai.speak(text, lang);
    if (mp3) {
      const f = outBase + ".mp3";
      await writeFile(f, mp3);
      return f;
    }
  } catch (e) {
    console.warn("[render] AI TTS failed, falling back to espeak-ng:", (e as Error).message);
  }
  const f = outBase + ".wav";
  // espeak-ng can't read kanji reliably, so Japanese is narrated from its kana reading.
  const spoken = lang === "ja" && scene.reading ? collapse(scene.reading) : text;
  await run("espeak-ng", ["-v", TARGET_INFO[lang].espeak, "-s", lang === "ja" ? "150" : "135", "-p", "45", "-w", f, spoken]);
  return f;
}

function vttTime(s: number) {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}

export interface RenderResult {
  video: Buffer;
  poster: Buffer;
  vtt: string;
  timings: { start: number; end: number }[];
  durationMs: number;
  narration: "openai" | "espeak-ng";
}

export async function renderVideo(ai: AIProvider, title: string, body: VideoBody, onProgress?: (p: number) => Promise<void>, db?: SupabaseClient, lang: TargetLang = "es"): Promise<RenderResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "lingoloop-"));
  try {
    const b = await getBrowser();
    const page = await b.newPage({ viewport: { width: W, height: H } });
    const clips: string[] = [];
    const timings: { start: number; end: number }[] = [];
    let t = 0;
    let narration: RenderResult["narration"] = "espeak-ng";
    const n = body.scenes.length;

    for (let i = 0; i < n; i++) {
      const scene = body.scenes[i];
      const audio = await narrate(ai, scene, lang, path.join(dir, `a${i}`), db);
      if (audio.endsWith(".mp3")) narration = "openai";
      const dur = await probeDuration(audio);
      const sceneDur = dur + PAD;
      timings.push({ start: Math.round(t * 1000), end: Math.round((t + dur) * 1000) });
      t += sceneDur;

      await page.setContent(sceneHtml(scene, title, i, n, lang), { waitUntil: "load" });
      const png = path.join(dir, `f${i}.png`);
      await page.screenshot({ path: png });

      const frames = Math.ceil(sceneDur * FPS);
      const clip = path.join(dir, `c${i}.mp4`);
      await run("ffmpeg", [
        "-y", "-loglevel", "error",
        "-loop", "1", "-i", png,
        "-i", audio,
        "-filter_complex",
        `[0:v]scale=${W * 1.1}:${H * 1.1},zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=${FPS},format=yuv420p[v];` +
          `[1:a]aresample=44100,apad=pad_dur=${PAD}[a]`,
        "-map", "[v]", "-map", "[a]",
        "-t", sceneDur.toFixed(3),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        clip,
      ]);
      clips.push(clip);
      await onProgress?.(Math.round(((i + 1) / n) * 90));
    }
    await page.close();

    const list = path.join(dir, "list.txt");
    await writeFile(list, clips.map((c) => `file '${c}'`).join("\n"));
    const out = path.join(dir, "out.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
    const posterPath = path.join(dir, "poster.jpg");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(dir, "f0.png"), "-vf", "scale=540:960", "-q:v", "4", posterPath]);

    const vtt =
      "WEBVTT\n\n" +
      body.scenes.map((s, i) => `${i + 1}\n${vttTime(timings[i].start / 1000)} --> ${vttTime(timings[i].end / 1000)}\n${displayText(s.text)}\n`).join("\n");

    return {
      video: await readFile(out),
      poster: await readFile(posterPath),
      vtt,
      timings,
      durationMs: Math.round((await probeDuration(out)) * 1000),
      narration,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
