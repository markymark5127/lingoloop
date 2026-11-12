import { route, requireUser } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { overall, label } from "@/lib/engine";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProfile, localizeVocab, targetOf } from "@/lib/learning/service";
import { toLocale } from "@/lib/i18n/core";

/** Vocabulary due for spaced review (RLS-scoped read). */
export const GET = route(async () => {
  const user = await requireUser();
  const db = await supabaseServer();
  const profile = await getProfile(supabaseAdmin(), user.id);
  const locale = toLocale(profile.native_language);
  const { data, error } = await db
    .from("user_vocabulary")
    .select("vocab_id, saved, recognition, listening, production, due_at, incorrect_count, vocabulary_items!inner(lemma, reading, translation, translation_ja, emoji, language)")
    .eq("user_id", user.id)
    .eq("vocabulary_items.language", targetOf(profile))
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(50);
  if (error) throw error;
  return {
    due: (data ?? []).map((r) => {
      const v = localizeVocab({ example_translation: null, ...(r.vocabulary_items as unknown as { lemma: string; reading: string | null; translation: string; translation_ja: string | null; emoji: string | null }) }, locale);
      const o = overall(r);
      return { vocabId: r.vocab_id, lemma: v.lemma, reading: v.reading, translation: v.translation, emoji: v.emoji, saved: r.saved, dueAt: r.due_at, mastery: o, label: label(o) };
    }),
  };
});
