/**
 * Seed starter content: vocabulary bank, starter stories, and starter video scripts.
 * Videos are queued as generation jobs; run the worker to render them into real MP4s.
 *   npm run seed && npm run worker -- --once
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STARTER_VOCAB } from "../src/lib/content/starter-vocab";
import { STARTER_STORIES, STARTER_VIDEOS } from "../src/lib/content/starter-content";
import { StoryBody, VideoBody } from "../src/lib/content/schemas";
import { linkContentVocabulary, loadVocab } from "../src/lib/learning/service";

config({ path: ".env.local" });
config();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { error: vErr } = await db.from("vocabulary_items").upsert(STARTER_VOCAB, { onConflict: "language,lemma" });
  if (vErr) throw vErr;
  await loadVocab(db, true);
  console.log(`vocabulary: ${STARTER_VOCAB.length}`);

  for (const s of STARTER_STORIES) {
    const body = StoryBody.parse(s.body);
    const { data: existing } = await db.from("content_items").select("id").eq("kind", "story").eq("title", s.title).eq("source", "starter").maybeSingle();
    if (existing) continue;
    const { data, error } = await db
      .from("content_items")
      .insert({ kind: "story", title: s.title, genre: s.genre, cefr: s.cefr, summary: s.summary, series: s.series, series_order: s.series_order, body, status: "ready", source: "starter" })
      .select("id")
      .single();
    if (error) throw error;
    const ids = await linkContentVocabulary(db, data.id, body.chapters.flatMap((c) => c.paragraphs.map((p) => p.es)).join(" "));
    console.log(`story: ${s.title} (${ids.length} words)`);
  }

  for (const v of STARTER_VIDEOS) {
    const body = VideoBody.parse(v.body);
    const { data: existing } = await db.from("content_items").select("id").eq("kind", "video").eq("title", v.title).eq("source", "starter").maybeSingle();
    if (existing) continue;
    const { data, error } = await db
      .from("content_items")
      .insert({ kind: "video", title: v.title, genre: v.genre, cefr: v.cefr, summary: v.summary, body, status: "processing", source: "starter" })
      .select("id")
      .single();
    if (error) throw error;
    const ids = await linkContentVocabulary(db, data.id, body.scenes.map((s) => s.text).join(" "));
    await db.from("generation_jobs").insert({ kind: "video", input: { content_id: data.id }, content_id: data.id });
    console.log(`video queued: ${v.title} (${ids.length} words)`);
  }
}

main().then(
  () => console.log("seed complete"),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
