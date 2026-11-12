import { route, requireUser, rateLimit } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProfile, loadVocab, localizeVocab, targetOf } from "@/lib/learning/service";
import { toLocale } from "@/lib/i18n/core";
import { buildFormIndex, cleanWord } from "@/lib/engine";
import { ai } from "@/lib/ai";

/**
 * Tap-to-translate: dictionary first, then a cached AI lookup, then a fresh AI lookup (stored in
 * the cache so nobody pays for the same word twice).
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  rateLimit(`lookup:${user.id}`, 120);
  const url = new URL(req.url);
  const word = (url.searchParams.get("w") ?? "").slice(0, 60);
  const sentence = (url.searchParams.get("s") ?? "").slice(0, 300);
  const admin = supabaseAdmin();
  const profile = await getProfile(admin, user.id);
  const lang = targetOf(profile);
  const locale = toLocale(profile.native_language);
  const vocab = await loadVocab(admin, lang);
  const index = buildFormIndex(vocab.map((v) => ({ id: v.id, lemma: v.lemma, forms: v.forms })));
  const key = cleanWord(word);
  const id = index.get(key);
  const raw = id ? vocab.find((v) => v.id === id) : undefined;
  if (raw) {
    const hit = localizeVocab(raw, locale);
    return { found: true, source: "dictionary", vocabId: hit.id, lemma: hit.lemma, reading: hit.reading ?? null, translation: hit.translation, partOfSpeech: hit.part_of_speech, emoji: hit.emoji, example: hit.example, exampleTranslation: hit.example_translation };
  }
  if (!key) return { found: false, word };

  const { data: cached } = await admin.from("ai_lookup_cache").select("lemma, reading, translation, part_of_speech, hits").eq("language", lang).eq("word", key).eq("native_language", locale).maybeSingle();
  if (cached) {
    void admin.from("ai_lookup_cache").update({ hits: (cached.hits ?? 0) + 1 }).eq("language", lang).eq("word", key).eq("native_language", locale).then(() => {});
    return { found: true, source: "ai", cached: true, vocabId: null, lemma: cached.lemma, reading: cached.reading, translation: cached.translation, partOfSpeech: cached.part_of_speech };
  }
  const l = await ai().lookup(word, sentence, locale, lang);
  if (l) {
    await admin
      .from("ai_lookup_cache")
      .upsert({ language: lang, word: key, native_language: locale, lemma: l.lemma, reading: l.reading ?? null, translation: l.translation, part_of_speech: l.partOfSpeech }, { onConflict: "language,word,native_language" });
    return { found: true, source: "ai", vocabId: null, lemma: l.lemma, reading: l.reading ?? null, translation: l.translation, partOfSpeech: l.partOfSpeech };
  }
  return { found: false, word };
});
