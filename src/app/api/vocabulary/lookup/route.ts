import { route, requireUser, rateLimit } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadVocab } from "@/lib/learning/service";
import { buildFormIndex, cleanWord } from "@/lib/engine";
import { ai } from "@/lib/ai";

/** Tap-to-translate: dictionary first, then AI lookup in context (if configured). */
export const GET = route(async (req) => {
  const user = await requireUser();
  rateLimit(`lookup:${user.id}`, 120);
  const url = new URL(req.url);
  const word = (url.searchParams.get("w") ?? "").slice(0, 60);
  const sentence = (url.searchParams.get("s") ?? "").slice(0, 300);
  const vocab = await loadVocab(supabaseAdmin());
  const index = buildFormIndex(vocab.map((v) => ({ id: v.id, lemma: v.lemma, forms: v.forms })));
  const id = index.get(cleanWord(word));
  const hit = id ? vocab.find((v) => v.id === id) : undefined;
  if (hit) {
    return { found: true, source: "dictionary", vocabId: hit.id, lemma: hit.lemma, translation: hit.translation, partOfSpeech: hit.part_of_speech, emoji: hit.emoji, example: hit.example, exampleTranslation: hit.example_translation };
  }
  const l = await ai().lookup(word, sentence);
  if (l) return { found: true, source: "ai", vocabId: null, lemma: l.lemma, translation: l.translation, partOfSpeech: l.partOfSpeech };
  return { found: false, word };
});
