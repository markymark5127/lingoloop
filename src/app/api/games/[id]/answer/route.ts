import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadVocab, reassessLevel, recordAnswers } from "@/lib/learning/service";
import { GAME_SKILL, GAME_WEIGHT, checkPair, label, validate, type BuiltGame, type GameType } from "@/lib/engine";

const Body = z.object({
  response: z.union([
    z.object({ optionId: z.string().max(64) }),
    z.object({ tokenIds: z.array(z.string().max(16)).max(20) }),
    z.object({ word: z.string().max(80) }),
    z.object({ pairs: z.array(z.tuple([z.string().max(32), z.string().max(32)])).max(12) }),
    z.object({ index: z.number().int().min(0).max(5) }),
  ]).optional(),
  checkPair: z.tuple([z.string().max(32), z.string().max(32)]).optional(),
  timeMs: z.number().int().min(0).max(600000).optional(),
  mistakes: z.number().int().min(0).max(100).optional(),
});

/** Validate an answer on the server, record the attempt, and update mastery + review schedule. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  rateLimit(`answer:${user.id}`, 120);
  const { id } = await ctx.params;
  const b = await parseJson(req, Body);
  const admin = supabaseAdmin();
  const { data: g } = await admin.from("game_instances").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!g) throw new HttpError(404, "Game not found");

  // Memory match: check a single flipped pair without ending the game.
  if (b.checkPair) return { match: checkPair(g.answer, b.checkPair[0], b.checkPair[1]) };

  if (g.answered_at) throw new HttpError(409, "This game was already answered");
  if (!b.response) throw new HttpError(400, "Missing response");
  const game: BuiltGame = { type: g.game_type, payload: g.payload, answer: g.answer, vocabIds: g.vocab_ids };
  const v = validate(game, b.response as never);
  // Memory match counts as fully correct only with few mistakes.
  const correct = g.game_type === "memory_match" ? v.correct && (b.mistakes ?? 0) <= 2 : v.correct;
  const perVocab = g.game_type === "memory_match" ? v.perVocab.map((p) => ({ ...p, correct })) : v.perVocab;

  await admin.from("game_attempts").insert({ game_id: id, user_id: user.id, response: b.response, correct, time_ms: b.timeMs ?? null });
  await admin.from("game_instances").update({ answered_at: new Date().toISOString() }).eq("id", id);

  const type = g.game_type as GameType;
  const skill = GAME_SKILL[type];
  const rows = await recordAnswers(
    admin,
    user.id,
    perVocab.map((p) => ({ vocabId: p.vocabId, skill, correct: p.correct, weight: GAME_WEIGHT[type], timeMs: b.timeMs })),
    "game",
    null,
    { game_id: id, game_type: type },
  );
  const level = await reassessLevel(admin, user.id);
  const vocab = await loadVocab(admin);
  const byId = new Map(vocab.map((x) => [x.id, x]));
  const focus = byId.get(g.vocab_ids[0]);
  const expectedVocab = typeof v.expected === "string" ? byId.get(v.expected) : undefined;
  return {
    correct,
    expected: v.expected,
    answerText: g.game_type === "story_challenge" ? (g.payload.options as string[])[Number(v.expected)] : expectedVocab ? `${expectedVocab.lemma} — ${expectedVocab.translation}` : typeof v.expected === "string" ? v.expected : null,
    focus: focus ? { lemma: focus.lemma, translation: focus.translation, emoji: focus.emoji } : null,
    mastery: rows.slice(0, 3).map((r) => ({ lemma: byId.get(r.vocab_id)?.lemma, skill, value: r[skill], label: label(r[skill]) })),
    level,
  };
});
