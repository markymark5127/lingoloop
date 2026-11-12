import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProfile, loadUserWords, loadVocab, recentAccuracy, toEntry } from "@/lib/learning/service";
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
import type { Question } from "@/lib/content/schemas";

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
  const [profile, words, vocab, acc, last] = await Promise.all([
    getProfile(admin, user.id),
    loadUserWords(admin, user.id),
    loadVocab(admin),
    recentAccuracy(admin, user.id, 20),
    admin.from("game_instances").select("game_type").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2),
  ]);
  const difficulty = difficultyFor(profile.level, acc.accuracy, acc.total);
  const levelIdx = CEFR_LEVELS.indexOf(profile.level);
  const pool = vocab.filter((v) => CEFR_LEVELS.indexOf(v.cefr as Cefr) <= levelIdx + 1).map(toEntry);
  const seed = Date.now() ^ user.id.charCodeAt(0);
  const rand = rng(seed);
  const recent = (last.data ?? []).map((g) => g.game_type as GameType);

  let game: BuiltGame | null = null;
  let reason = "";

  // Story challenge: occasionally quiz on a video the learner has watched.
  if (b.type === "story_challenge" || (!b.type && b.mode === "adaptive" && !recent.includes("story_challenge") && rand() < 0.2)) {
    const { data: watched } = await admin
      .from("content_progress")
      .select("content_id, content_items(title, body, kind)")
      .eq("user_id", user.id)
      .eq("completed", true)
      .limit(20);
    const videos = (watched ?? []).filter((w) => (w.content_items as unknown as { kind: string })?.kind === "video");
    if (videos.length) {
      const pick = videos[Math.floor(rand() * videos.length)];
      const c = pick.content_items as unknown as { title: string; body: { questions: Question[] } };
      const q = c.body.questions[Math.floor(rand() * c.body.questions.length)];
      const { data: links } = await admin.from("content_vocabulary").select("vocab_id").eq("content_id", pick.content_id);
      game = buildStoryChallenge(c.title, q, (links ?? []).map((l) => l.vocab_id), rand);
      reason = `About "${c.title}", which you watched`;
    } else if (b.type === "story_challenge") {
      throw new HttpError(400, "Watch a video first to unlock story challenges.");
    }
  }

  if (!game) {
    const allowed = b.type ? [b.type] : shuffle(gameTypesFor(difficulty).filter((t) => !recent.slice(0, 1).includes(t)), rand);
    const skill = GAME_SKILL[allowed[0]];
    const eligible = pool.filter((v) => supportsType(allowed[0], v));
    const focus = pickFocusWords(shuffle(eligible.length ? eligible : pool, rand), words, 6, new Date(), skill, b.mode === "review" ? 0 : 1);
    const types = [...allowed, ...gameTypesFor(difficulty).filter((t) => !allowed.includes(t))];
    game = buildFirstPossible(b.type ? [b.type] : types, focus, pool, difficulty, rand);
    if (!game) throw new HttpError(400, "Not enough vocabulary for that game yet.");
    const focusWord = pool.find((v) => v.id === game!.vocabIds[0]);
    const state = focusWord ? words.get(focusWord.id) : undefined;
    reason = !state
      ? `New word: ${focusWord?.lemma}`
      : state.dueAt && state.dueAt <= new Date()
        ? `Review due: ${focusWord?.lemma}`
        : `Practicing: ${focusWord?.lemma}`;
  }

  const { data, error } = await admin
    .from("game_instances")
    .insert({ user_id: user.id, game_type: game.type, difficulty, payload: game.payload, answer: game.answer, vocab_ids: game.vocabIds })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, type: game.type, difficulty, payload: game.payload, reason, skill: GAME_SKILL[game.type] };
});
