import { route, requireUser } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { overall, label } from "@/lib/engine";

/** Vocabulary due for spaced review (RLS-scoped read). */
export const GET = route(async () => {
  const user = await requireUser();
  const db = await supabaseServer();
  const { data, error } = await db
    .from("user_vocabulary")
    .select("vocab_id, saved, recognition, listening, production, due_at, incorrect_count, vocabulary_items(lemma, translation, emoji)")
    .eq("user_id", user.id)
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(50);
  if (error) throw error;
  return {
    due: (data ?? []).map((r) => {
      const v = r.vocabulary_items as unknown as { lemma: string; translation: string; emoji: string | null };
      const o = overall(r);
      return { vocabId: r.vocab_id, lemma: v.lemma, translation: v.translation, emoji: v.emoji, saved: r.saved, dueAt: r.due_at, mastery: o, label: label(o) };
    }),
  };
});
