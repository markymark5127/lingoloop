/**
 * Generate a fresh set of starter videos with Grok: one per genre × level × target language
 * (8 × 3 × 2 = 48). Scripts are written and native-reviewed by Grok only — the script refuses to
 * run if Grok isn't configured and reachable, and never falls back to OpenAI for text. Narration
 * still uses the OpenAI TTS voice (Grok has no TTS in this pipeline).
 *
 * Each script is inserted as a `starter` video (status "processing") and queued as a render job;
 * run the worker to render them into MP4s.
 *
 *   npm run starters:hosted                         # generate + queue all 48
 *   npm run starters:hosted -- --since=<iso>        # resume: skip combos generated since <iso>
 *   npm run starters:hosted -- --only=es:A1:comedy  # a single combo (quick test)
 *   npm run starters:hosted -- --lang=ja            # one target language (run two in parallel)
 *   npm run starters:hosted -- --delete-old --since=<iso>
 *       # after the new set is rendered: delete starter videos created before <iso> (+ their media)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createProvider } from "../src/lib/ai/factory";
import { OpenAIProvider } from "../src/lib/ai/openai";
import { GENRES, checkTargetText, type VideoScript } from "../src/lib/content/schemas";
import { CEFR_LEVELS } from "../src/lib/engine/level";
import { linkContentVocabulary, loadVocab } from "../src/lib/learning/service";
import type { TargetLang } from "../src/lib/lang";

config({ path: ".env.local" });
config();

const LANGS: TargetLang[] = ["es", "ja"];
const LEVELS = ["A1", "A2", "B1"] as const;
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string) => process.argv.includes(`--${name}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const since = arg("since") ?? new Date().toISOString();

async function preflightGrok() {
  const key = process.env.GROK_API_KEY?.trim();
  if (!key) throw new Error("GROK_API_KEY is not set — refusing to generate (no OpenAI fallback).");
  const base = process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1";
  const model = process.env.GROK_MODEL || "grok-2-latest";
  const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const body = (await res.json().catch(() => ({}))) as { data?: { id: string }[]; error?: string };
  if (!res.ok) throw new Error(`Grok is not available (HTTP ${res.status}): ${body.error ?? "unknown error"}`);
  const ids = (body.data ?? []).map((m) => m.id);
  if (!ids.includes(model)) throw new Error(`GROK_MODEL "${model}" isn't available on this key. Available: ${ids.join(", ")}`);
  console.log(`[starters] Grok OK — model ${model}`);
}

async function deleteOld() {
  const { data: old, error } = await db.from("content_items").select("id, title, language").eq("source", "starter").eq("kind", "video").lt("created_at", since);
  if (error) throw error;
  const { count: fresh } = await db.from("content_items").select("id", { count: "exact", head: true }).eq("source", "starter").eq("kind", "video").eq("status", "ready").gte("created_at", since);
  if (!flag("force") && (fresh ?? 0) < LANGS.length * LEVELS.length * GENRES.length) {
    throw new Error(`Only ${fresh ?? 0} new starter videos are ready — not deleting the old ones yet (pass --force to override).`);
  }
  for (const item of old ?? []) {
    const prefix = `videos/${item.id}`;
    const { data: files } = await db.storage.from("media").list(prefix);
    if (files?.length) await db.storage.from("media").remove(files.map((f) => `${prefix}/${f.name}`));
    const { error: dErr } = await db.from("content_items").delete().eq("id", item.id);
    if (dErr) throw dErr;
    console.log(`[starters] deleted old (${item.language}) ${item.title}`);
  }
  console.log(`[starters] deleted ${old?.length ?? 0} old starter videos`);
}

async function generate() {
  await preflightGrok();
  const ai = createProvider();
  if (!(ai instanceof OpenAIProvider) || ai.videoScriptModel.provider !== "grok") throw new Error("Video scripts are not routed to Grok — aborting.");

  const only = arg("only")?.split(":");
  const { data: existing } = await db.from("content_items").select("language, cefr, genre").eq("source", "starter").eq("kind", "video").gte("created_at", since);
  const done = new Set((existing ?? []).map((e) => `${e.language}:${e.cefr}:${e.genre}`));
  const failures: string[] = [];
  console.log(`[starters] run marker --since=${since}`);

  const langs = arg("lang") ? LANGS.filter((l) => l === arg("lang")) : LANGS;
  outer: for (const language of langs) {
    const vocab = await loadVocab(db, language, true);
    for (const level of LEVELS) {
      const levelIdx = CEFR_LEVELS.indexOf(level);
      const core = vocab.filter((v) => CEFR_LEVELS.indexOf(v.cefr as (typeof CEFR_LEVELS)[number]) <= levelIdx);
      for (const genre of GENRES) {
        const key = `${language}:${level}:${genre}`;
        if (only && key !== only.join(":")) continue;
        if (done.has(key)) {
          console.log(`[starters] skip ${key} (already generated)`);
          continue;
        }
        const focus = core.filter((v) => v.part_of_speech === "noun" && v.emoji).sort(() => Math.random() - 0.5).slice(0, 3);
        const hint = (v: (typeof core)[number]) => ({ lemma: v.lemma, reading: v.reading ?? null, translation: v.translation, translation_ja: v.translation_ja ?? null, article: v.article, emoji: v.emoji, pos: v.part_of_speech });
        try {
          const script: VideoScript = await ai.generateVideo({ language, level, genre, interests: [genre], focusWords: focus.map(hint), knownWords: core.slice(0, 60).map((v) => v.lemma) });
          const check = checkTargetText(script.body.scenes.map((s) => s.text), level, language);
          if (!check.ok) throw new Error(check.problems.join("; "));
          const { data, error } = await db
            .from("content_items")
            .insert({ kind: "video", language, title: script.title, genre, cefr: level, summary: script.summary, body: script.body, status: "processing", is_public: true, source: "starter" })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          await linkContentVocabulary(db, data.id, script.body.scenes.map((s) => s.text).join(" "), focus.map((v) => v.id), language);
          const { error: jErr } = await db.from("generation_jobs").insert({ kind: "video", input: { content_id: data.id }, content_id: data.id });
          if (jErr) throw new Error(jErr.message);
          console.log(`[starters] queued ${key}: ${script.title}`);
        } catch (e) {
          const msg = (e as Error).message;
          failures.push(`${key}: ${msg}`);
          console.error(`[starters] FAILED ${key}: ${msg}`);
          // Out of credits / auth problems won't fix themselves — stop instead of burning through the list.
          if (/credits|spending limit|401|403/i.test(msg)) break outer;
        }
      }
    }
  }
  console.log(`[starters] finished with ${failures.length} failure(s). Resume with --since=${since}`);
  if (failures.length) process.exitCode = 1;
}

(flag("delete-old") ? deleteOld() : generate()).catch((e) => {
  console.error(`[starters] ${(e as Error).message}`);
  process.exit(1);
});
