import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProfile, loadUserWords, loadVocab, recentAccuracy, targetOf, toEntry } from "@/lib/learning/service";
import { makeT, toLocale } from "@/lib/i18n/core";
import {
  CEFR_LEVELS,
  GAME_SKILL,
  GAME_TYPES,
  buildFirstPossible,
  buildStoryChallenge,
  difficultyFor,
  gameTypesFor,
  pickFocusWords,
  supportsType,
  rng,
  shuffle,
  type BuiltGame,
  type Cefr,
  type GameType,
} from "@/lib/engine";
import type { VideoScript } from "@/lib/content/schemas";

type VideoBody = VideoScript["body"];
/** Scene pictures of a video (each emoji string is one picture). */
const scenePictures = (b: VideoBody | undefined) => [...new Set((b?.scenes ?? []).map((s) => s.emoji).filter((e): e is string => !!e))];
const Body = z.object({ type: z.enum(GAME_TYPES).optional(), mode: z.enum(["adaptive", "review"]).default("adaptive") });

/**
 * Create the next game for this learner. The engine picks the type from adaptive difficulty and
 * the words from due reviews / weak spots. The answer is stored server-side only.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`games:${user.id}`, 60);
  const b = await parseJson(req, Body);
  const admin = supabaseAdmin();
  const profile = await getProfile(admin, user.id);
  const lang = targetOf(profile);
  const [words, vocab, acc, last] = await Promise.all([
    loadUserWords(admin, user.id),
    loadVocab(admin, lang),
    recentAccuracy(admin, user.id, 20, lang),
    admin.from("game_instances").select("game_type").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2),
  ]);
  const locale = toLocale(profile.native_language);
  const t = makeT(locale);
  const difficulty = difficultyFor(profile.level, acc.accuracy, acc.total);
  const levelIdx = CEFR_LEVELS.indexOf(profile.level);
  const pool = vocab.filter((v) => CEFR_LEVELS.indexOf(v.cefr as Cefr) <= levelIdx + 1).map((v) => toEntry(v, locale));
  const seed = Date.now() ^ user.id.charCodeAt(0);
  const rand = rng(seed);
  const recent = (last.data ?? []).map((g) => g.game_type as GameType);

  let game: BuiltGame | null = null;
  let reason = "";

  // Story challenge: occasionally quiz on a video the learner has watched.
  if (b.type === "story_challenge" || (!b.type && b.mode === "adaptive" && !recent.includes("story_challenge") && rand() < 0.2)) {
    const { data: watched } = await admin
      .from("content_progress")
      .select("content_id, content_items(title, body, kind, language)")
      .eq("user_id", user.id)
      .eq("completed", true)
      .limit(20);
    const videos = (watched ?? []).filter((w) => {
      const c = w.content_items as unknown as { kind: string; language: string } | null;
      return c?.kind === "video" && c.language === lang;
    });
    if (videos.length) {
      const pick = videos[Math.floor(rand() * videos.length)];
      const c = pick.content_items as unknown as { title: string; body: VideoBody };
      // Distractor pictures come from other videos in the same language.
      const { data: others } = await admin.from("content_items").select("body").eq("kind", "video").eq("language", lang).neq("id", pick.content_id).limit(30);
      const unseen = (others ?? []).flatMap((o) => scenePictures(o.body as VideoBody));
      const { data: links } = await admin.from("content_vocabulary").select("vocab_id").eq("content_id", pick.content_id);
      game = buildStoryChallenge(c.title, scenePictures(c.body), unseen, (links ?? []).map((l) => l.vocab_id), rand, lang, difficulty);
      if (game) reason = t('About "{title}", which you watched', { title: c.title });
    }
    if (!game && b.type === "story_challenge") {
      throw new HttpError(400, t("Watch a video first to unlock story challenges."));
    }
  }

  if (b.type === "pitch_accent" && lang !== "ja") throw new HttpError(400, t("Pitch accent games are for Japanese."));

  if (!game) {
    // Japanese learners also get pitch-accent practice mixed in.
    const adaptive = [...gameTypesFor(difficulty), ...(lang === "ja" ? (["pitch_accent"] as GameType[]) : [])];
    const allowed = b.type ? [b.type] : shuffle(adaptive.filter((t) => !recent.slice(0, 1).includes(t)), rand);
    const skill = GAME_SKILL[allowed[0]];
    const eligible = pool.filter((v) => supportsType(allowed[0], v));
    const focus = pickFocusWords(shuffle(eligible.length ? eligible : pool, rand), words, 6, new Date(), skill, b.mode === "review" ? 0 : 1);
    const types = [...allowed, ...adaptive.filter((t) => !allowed.includes(t))];
    game = buildFirstPossible(b.type ? [b.type] : types, focus, pool, difficulty, rand, lang);
    if (!game) throw new HttpError(400, t("Not enough vocabulary for that game yet."));
    const focusWord = pool.find((v) => v.id === game!.vocabIds[0]);
    const state = focusWord ? words.get(focusWord.id) : undefined;
    reason = !state
      ? t("New word: {word}", { word: focusWord?.lemma ?? "" })
      : state.dueAt && state.dueAt <= new Date()
        ? t("Review due: {word}", { word: focusWord?.lemma ?? "" })
        : t("Practicing: {word}", { word: focusWord?.lemma ?? "" });
  }

  const { data, error } = await admin
    .from("game_instances")
    .insert({ user_id: user.id, game_type: game.type, difficulty, payload: game.payload, answer: game.answer, vocab_ids: game.vocabIds })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, type: game.type, difficulty, payload: game.payload, reason, skill: GAME_SKILL[game.type], language: lang };
});
