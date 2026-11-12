"use client";
/**
 * Speech output: server TTS (OpenAI) when available, otherwise the browser's voice for the
 * language being learned (Spanish or Japanese, detected from the text's script).
 * Speech input: browser SpeechRecognition when available, otherwise record + server transcription.
 */
import { TARGET_INFO, displayText, langOfText, type TargetLang } from "@/lib/lang";

let target: TargetLang = "es";
/** Set by TargetProvider: the language speech recognition listens for. */
export function setSpeechTarget(lang: TargetLang) {
  target = lang;
}

const cache = new Map<string, string>();
let serverTts: boolean | null = null;
let current: HTMLAudioElement | null = null;

export function stopSpeaking() {
  current?.pause();
  current = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

function voiceFor(lang: TargetLang): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const tag = TARGET_INFO[lang].bcp47;
  return voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang.replace("_", "-").startsWith(lang));
}

function browserSpeak(text: string, rate: number, lang: TargetLang): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = TARGET_INFO[lang].bcp47;
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
    // Safety: some engines never fire onend.
    setTimeout(resolve, 1500 + text.length * 120 / rate);
  });
}

export async function speak(raw: string, opts: { rate?: number; lang?: TargetLang } = {}): Promise<void> {
  stopSpeaking();
  const rate = opts.rate ?? 0.95;
  const lang = opts.lang ?? langOfText(raw);
  const text = displayText(raw);
  if (serverTts !== false) {
    try {
      let url = cache.get(`${lang}|${text}`);
      if (!url) {
        const res = await fetch("/api/audio/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
        if (res.status === 204) {
          serverTts = false;
          return browserSpeak(text, rate, lang);
        }
        if (!res.ok) throw new Error("tts failed");
        serverTts = true;
        url = URL.createObjectURL(await res.blob());
        cache.set(`${lang}|${text}`, url);
      }
      const audio = new Audio(url);
      audio.playbackRate = rate;
      current = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
      return;
    } catch {
      /* fall through */
    }
  }
  return browserSpeak(text, rate, lang);
}

// ---------------------------------------------------------------- input
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function browserRecognitionAvailable() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function createRecognizer(onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void) {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = TARGET_INFO[target].bcp47;
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = e.results[i].isFinal;
    }
    onText(text, final);
  };
  r.onerror = (e) => onEnd(e.error);
  r.onend = () => onEnd();
  return r;
}

/** Record from the microphone and send to /api/audio/transcribe. */
export async function recordAndTranscribe(maxMs = 15000, signal?: AbortSignal): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  rec.start();
  const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), maxMs);
  signal?.addEventListener("abort", () => rec.state !== "inactive" && rec.stop());
  await done;
  clearTimeout(timer);
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
  const form = new FormData();
  form.append("audio", new File([blob], "speech.webm", { type: blob.type }));
  const res = await fetch("/api/audio/transcribe", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Transcription failed");
  return data.text as string;
}
