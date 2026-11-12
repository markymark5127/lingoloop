import { z } from "zod";
import { route, requireUser, parseJson, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProfile, loadVocab, targetOf } from "@/lib/learning/service";

const Body = z.union([
  z.object({ vocabId: z.uuid(), saved: z.boolean().default(true) }),
  z.object({ lemma: z.string().trim().min(1).max(60), translation: z.string().trim().min(1).max(120), partOfSpeech: z.string().max(20).default("other"), reading: z.string().trim().max(60).optional(), saved: z.boolean().default(true) }),
]);

/** Save a word to the learner's review list. New AI-looked-up words are added to the shared dictionary. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const b = await parseJson(req, Body);
  const admin = supabaseAdmin();
  let vocabId: string;
  if ("vocabId" in b) {
    const { data } = await admin.from("vocabulary_items").select("id").eq("id", b.vocabId).maybeSingle();
    if (!data) throw new HttpError(404, "Unknown word");
    vocabId = data.id;
  } else {
    const lang = targetOf(await getProfile(admin, user.id));
    const lemma = lang === "es" ? b.lemma.toLowerCase() : b.lemma;
    const { data, error } = await admin
      .from("vocabulary_items")
      .upsert({ language: lang, lemma, translation: b.translation, part_of_speech: b.partOfSpeech, reading: b.reading ?? null, cefr: "B1" }, { onConflict: "language,lemma", ignoreDuplicates: false })
      .select("id")
      .single();
    if (error) throw error;
    vocabId = data.id;
    await loadVocab(admin, lang, true);
  }
  const { data: existing } = await admin.from("user_vocabulary").select("vocab_id").eq("user_id", user.id).eq("vocab_id", vocabId).maybeSingle();
  if (existing) await admin.from("user_vocabulary").update({ saved: b.saved }).eq("user_id", user.id).eq("vocab_id", vocabId);
  else await admin.from("user_vocabulary").insert({ user_id: user.id, vocab_id: vocabId, saved: b.saved, due_at: new Date().toISOString() });
  await admin.from("learning_events").insert({ user_id: user.id, activity: "review", event_type: b.saved ? "saved_word" : "unsaved_word", vocab_id: vocabId });
  return { ok: true, vocabId, saved: b.saved };
});
