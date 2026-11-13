/**
 * Background media worker. Claims queued generation jobs from Postgres (FOR UPDATE SKIP LOCKED),
 * generates content with the AI provider, renders videos, uploads media to Supabase Storage and
 * marks content ready. Run: `npm run worker` (long-running) or `npm run worker -- --once`.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProvider } from "../src/lib/ai/factory";
import { StoryScript, VideoBody, VideoScript, checkTargetText } from "../src/lib/content/schemas";
import { generationContext, linkContentVocabulary } from "../src/lib/learning/service";
import { closeBrowser, renderVideo } from "./render";
import { assertImagineConfigured, imagineEnabled, imagineVoice } from "./imagine";
import { toTarget } from "../src/lib/lang";

loadEnv({ path: ".env.local" });

const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const ai = createProvider();
const once = process.argv.includes("--once");
// Publish generated content to the shared library so other learners reuse it instead of paying
// for a new generation. Set SHARE_GENERATED_CONTENT=false to keep generations private.
const share = process.env.SHARE_GENERATED_CONTENT !== "false";

interface Job {
  id: string;
  user_id: string | null;
  kind: "video" | "story";
  input: { content_id?: string; genre?: string; language?: string };
  attempts: number;
}

async function setJob(id: string, patch: Record<string, unknown>) {
  await db.from("generation_jobs").update(patch).eq("id", id);
}

async function upload(path: string, data: Buffer | string, contentType: string) {
  const { error } = await db.storage.from("media").upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/** Render an existing video content item and store its media. */
async function renderContent(jobId: string, contentId: string) {
  const { data: item, error } = await db.from("content_items").select("id, title, body, language, genre").eq("id", contentId).single();
  if (error || !item) throw new Error(`content ${contentId} not found`);
  const body = VideoBody.parse(item.body);
  const result = await renderVideo(ai, item.title, body, (p) => setJob(jobId, { progress: p }), db, toTarget(item.language), item.genre);
  const base = `videos/${contentId}`;
  const [videoUrl, posterUrl, vttUrl] = await Promise.all([
    upload(`${base}/video.mp4`, result.video, "video/mp4"),
    upload(`${base}/poster.jpg`, result.poster, "image/jpeg"),
    upload(`${base}/captions.vtt`, result.vtt, "text/vtt"),
  ]);
  await db.from("media_assets").delete().eq("content_id", contentId);
  const { error: mErr } = await db.from("media_assets").insert([
    { content_id: contentId, kind: "video", storage_path: `${base}/video.mp4`, public_url: videoUrl, mime_type: "video/mp4", duration_ms: result.durationMs, meta: { narration: result.narration, visuals: result.visuals } },
    { content_id: contentId, kind: "poster", storage_path: `${base}/poster.jpg`, public_url: posterUrl, mime_type: "image/jpeg", meta: {} },
    { content_id: contentId, kind: "subtitles", storage_path: `${base}/captions.vtt`, public_url: vttUrl, mime_type: "text/vtt", meta: {} },
  ]);
  if (mErr) throw new Error(mErr.message);
  await db.from("content_items").update({ status: "ready", body: { ...body, timings: result.timings } }).eq("id", contentId);
}

async function processJob(job: Job) {
  console.log(`[worker] job ${job.id} ${job.kind} (attempt ${job.attempts})`);
  if (job.kind === "video") {
    let contentId = job.input.content_id;
    if (!contentId) {
      if (!job.user_id) throw new Error("video generation requires a user");
      const { ctx, focusIds, language } = await generationContext(db, job.user_id, job.input.genre, job.input.language ? toTarget(job.input.language) : undefined);
      const script: VideoScript = await ai.generateVideo(ctx);
      const check = checkTargetText(script.body.scenes.map((s) => s.text), ctx.level, language);
      if (!check.ok && ai.name === "openai") throw new Error(check.problems.join("; "));
      const { data, error } = await db
        .from("content_items")
        .insert({ kind: "video", language, title: script.title, genre: script.genre, cefr: ctx.level, summary: script.summary, body: script.body, status: "processing", is_public: share, created_by: job.user_id, source: ai.name })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      contentId = data.id as string;
      await setJob(job.id, { content_id: contentId, progress: 10 });
      await linkContentVocabulary(db, contentId, script.body.scenes.map((s) => s.text).join(" "), focusIds, language);
    }
    await renderContent(job.id, contentId);
    return contentId;
  }

  // story
  if (!job.user_id) throw new Error("story generation requires a user");
  const { ctx, focusIds, language } = await generationContext(db, job.user_id, job.input.genre, job.input.language ? toTarget(job.input.language) : undefined);
  const story: StoryScript = await ai.generateStory(ctx);
  const { data, error } = await db
    .from("content_items")
    .insert({ kind: "story", language, title: story.title, genre: story.genre, cefr: ctx.level, summary: story.summary, body: story.body, status: "ready", is_public: share, created_by: job.user_id, source: ai.name, series: story.title, series_order: 1 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await linkContentVocabulary(db, data.id, story.body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)).join(" "), focusIds, language);
  return data.id as string;
}

async function tick(): Promise<boolean> {
  const { data, error } = await db.rpc("claim_generation_job");
  if (error) {
    console.error("[worker] claim failed:", error.message);
    return false;
  }
  const job = (data as Job[] | null)?.[0];
  if (!job) return false;
  try {
    const contentId = await processJob(job);
    await setJob(job.id, { status: "succeeded", progress: 100, content_id: contentId, finished_at: new Date().toISOString(), error: null });
    console.log(`[worker] job ${job.id} done -> ${contentId}`);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[worker] job ${job.id} failed:`, msg);
    const retry = job.attempts < 3;
    await setJob(job.id, { status: retry ? "queued" : "failed", error: msg, finished_at: retry ? null : new Date().toISOString() });
    if (!retry && job.input.content_id) await db.from("content_items").update({ status: "failed" }).eq("id", job.input.content_id);
  }
  return true;
}

async function main() {
  if (imagineEnabled()) assertImagineConfigured();
  console.log(`[worker] started (AI: ${ai.name}, visuals: ${imagineEnabled() ? "grok imagine" : "emoji cards"}, voice: ${imagineVoice() ? "characters speak (grok imagine)" : "tts voice-over"}${once ? ", --once" : ""})`);
  for (;;) {
    const worked = await tick();
    if (!worked) {
      if (once) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await closeBrowser();
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
