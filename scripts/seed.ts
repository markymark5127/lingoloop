/**
 * Seed starter content: vocabulary bank, starter stories, and starter video scripts.
 * Videos are queued as generation jobs; run the worker to render them into real MP4s.
 *   npm run seed && npm run worker -- --once
 *
 * Re-running is safe: existing starter items are not duplicated, but their Japanese translations
 * are (re)applied in place, keeping rendered media and caption timings.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STARTER_VOCAB } from "../src/lib/content/starter-vocab";
import { STARTER_VOCAB_JA } from "../src/lib/content/starter-vocab-ja";
import { STARTER_STORIES, STARTER_VIDEOS, type StarterStory, type StarterVideo } from "../src/lib/content/starter-content";
import { STARTER_VOCAB_JA_TARGET } from "../src/lib/content/japanese/vocab";
import { STARTER_STORIES_JA, STARTER_VIDEOS_JA } from "../src/lib/content/japanese/content";
import type { TargetLang } from "../src/lib/lang";
import { contentJa } from "../src/lib/content/ja-content";
import { StoryBody, VideoBody, type Question } from "../src/lib/content/schemas";
import { linkContentVocabulary, loadVocab } from "../src/lib/learning/service";

config({ path: ".env.local" });
config();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const missing = new Set<string>();
function ja(en: string) {
  const v = contentJa(en);
  if (!v) missing.add(en);
  return v;
}
function jaQuestion(q: Question): Question {
  const options_ja = q.options.map((o) => ja(o));
  return { ...q, q_ja: ja(q.q), options_ja: options_ja.every(Boolean) ? (options_ja as string[]) : undefined };
}
function storyWithJa(body: StoryBody, summary: string): StoryBody {
  return {
    ...body,
    summary_ja: ja(summary),
    chapters: body.chapters.map((c) => ({ ...c, paragraphs: c.paragraphs.map((p) => ({ ...p, ja: ja(p.en) })), questions: c.questions.map(jaQuestion) })),
  };
}
function videoWithJa(body: VideoBody, summary: string): VideoBody {
  return { ...body, summary_ja: ja(summary), scenes: body.scenes.map((s) => ({ ...s, translation_ja: ja(s.translation) })), questions: body.questions.map(jaQuestion) };
}

async function main() {
  const vocab = STARTER_VOCAB.map((v) => ({ ...v, translation_ja: STARTER_VOCAB_JA[v.lemma]?.[0] ?? null, example_translation_ja: STARTER_VOCAB_JA[v.lemma]?.[1] ?? null }));
  const { error: vErr } = await db.from("vocabulary_items").upsert(vocab, { onConflict: "language,lemma" });
  if (vErr) throw vErr;
  await loadVocab(db, "es", true);
  console.log(`vocabulary (es): ${vocab.length} (${vocab.filter((v) => v.translation_ja).length} with Japanese glosses)`);
  const { error: jErr } = await db.from("vocabulary_items").upsert(STARTER_VOCAB_JA_TARGET, { onConflict: "language,lemma" });
  if (jErr) throw jErr;
  await loadVocab(db, "ja", true);
  console.log(`vocabulary (ja): ${STARTER_VOCAB_JA_TARGET.length}`);

  // Spanish content carries Japanese translations (for Japanese-speaking learners of Spanish).
  await seedContent("es", STARTER_STORIES, STARTER_VIDEOS, storyWithJa, videoWithJa);
  // Japanese content is for English speakers only.
  await seedContent("ja", STARTER_STORIES_JA, STARTER_VIDEOS_JA, (b) => b, (b) => b);
  if (missing.size) console.warn(`⚠ ${missing.size} content lines have no Japanese translation:\n  ${[...missing].join("\n  ")}`);
}

async function seedContent(
  language: TargetLang,
  stories: StarterStory[],
  videos: StarterVideo[],
  storyBody: (b: StoryBody, summary: string) => StoryBody,
  videoBody: (b: VideoBody, summary: string) => VideoBody,
) {
  for (const s of stories) {
    const body = storyBody(StoryBody.parse(s.body), s.summary);
    const { data: existing } = await db.from("content_items").select("id").eq("language", language).eq("kind", "story").eq("title", s.title).eq("source", "starter").maybeSingle();
    if (existing) {
      await db.from("content_items").update({ body, summary: s.summary }).eq("id", existing.id);
      await db.from("content_vocabulary").delete().eq("content_id", existing.id);
      await linkContentVocabulary(db, existing.id, body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)).join(" "), [], language);
      continue;
    }
    const { data, error } = await db
      .from("content_items")
      .insert({ kind: "story", language, title: s.title, genre: s.genre, cefr: s.cefr, summary: s.summary, series: s.series, series_order: s.series_order, body, status: "ready", source: "starter" })
      .select("id")
      .single();
    if (error) throw error;
    const ids = await linkContentVocabulary(db, data.id, body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)).join(" "), [], language);
    console.log(`story (${language}): ${s.title} (${ids.length} words)`);
  }

  for (const v of videos) {
    const fresh = videoBody(VideoBody.parse(v.body), v.summary);
    const { data: existing } = await db.from("content_items").select("id, body").eq("language", language).eq("kind", "video").eq("title", v.title).eq("source", "starter").maybeSingle();
    if (existing) {
      const old = existing.body as VideoBody | null;
      const sameScript = JSON.stringify(old?.scenes.map((x) => x.text)) === JSON.stringify(fresh.scenes.map((x) => x.text));
      if (sameScript) {
        // Keep worker-computed caption timings.
        await db.from("content_items").update({ body: { ...fresh, ...(old?.timings ? { timings: old.timings } : {}) }, summary: v.summary }).eq("id", existing.id);
      } else {
        // The script changed: re-render narration, captions and video.
        await db.from("content_items").update({ body: fresh, summary: v.summary, status: "processing" }).eq("id", existing.id);
        await db.from("generation_jobs").insert({ kind: "video", input: { content_id: existing.id }, content_id: existing.id });
        console.log(`video re-render queued (${language}): ${v.title}`);
      }
      await db.from("content_vocabulary").delete().eq("content_id", existing.id);
      await linkContentVocabulary(db, existing.id, fresh.scenes.map((x) => x.text).join(" "), [], language);
      continue;
    }
    const { data, error } = await db
      .from("content_items")
      .insert({ kind: "video", language, title: v.title, genre: v.genre, cefr: v.cefr, summary: v.summary, body: fresh, status: "processing", source: "starter" })
      .select("id")
      .single();
    if (error) throw error;
    const ids = await linkContentVocabulary(db, data.id, fresh.scenes.map((s) => s.text).join(" "), [], language);
    await db.from("generation_jobs").insert({ kind: "video", input: { content_id: data.id }, content_id: data.id });
    console.log(`video queued (${language}): ${v.title} (${ids.length} words)`);
  }
}

main().then(
  () => console.log("seed complete"),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
