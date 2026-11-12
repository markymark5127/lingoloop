import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getScenario } from "@/lib/content/scenarios";
import { ai } from "@/lib/ai";
import { generationContext, recordAnswers, recordExposure, vocabIdsInText, logEvent } from "@/lib/learning/service";
import { normalize } from "@/lib/engine";

const Body = z.object({ content: z.string().trim().min(1).max(500), viaVoice: z.boolean().default(false) });
const DAILY_LIMIT = Number(process.env.DAILY_AI_MESSAGE_LIMIT ?? 200);

/**
 * Send a learner message and get the character's reply. Words the learner uses count as
 * production practice (incorrect if the tutor flagged that phrase); corrections are held for the
 * end-of-session summary rather than interrupting the conversation.
 */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  rateLimit(`msg:${user.id}`, 20);
  const { id } = await ctx.params;
  const b = await parseJson(req, Body);
  const admin = supabaseAdmin();
  const { data: session } = await admin.from("conversation_sessions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!session) throw new HttpError(404, "Conversation not found");
  if (session.status !== "active") throw new HttpError(409, "This conversation has ended");
  const scenario = getScenario(session.scenario);
  if (!scenario) throw new HttpError(500, "Scenario missing");

  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("conversation_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user").gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, "Daily conversation limit reached. Come back tomorrow!"); // translated client-side

  const { data: history } = await admin.from("conversation_messages").select("role, content").eq("session_id", id).order("created_at");
  const turnIndex = (history ?? []).filter((m) => m.role === "user").length;
  const { ctx: gen, profile } = await generationContext(admin, user.id, undefined, scenario.language);

  const turn = await ai().chat({
    scenario,
    level: session.level,
    nativeLanguage: profile.native_language,
    history: (history ?? []) as { role: "user" | "assistant"; content: string }[],
    userMessage: b.content,
    knownWords: gen.knownWords,
    focusWords: gen.focusWords,
    turnIndex,
  });

  const { data: userMsg } = await admin
    .from("conversation_messages")
    .insert({ session_id: id, user_id: user.id, role: "user", content: b.content, via_voice: b.viaVoice, feedback: turn.corrections.length ? { corrections: turn.corrections } : null })
    .select("id, role, content, via_voice, created_at")
    .single();
  const { data: reply } = await admin
    .from("conversation_messages")
    .insert({ session_id: id, user_id: user.id, role: "assistant", content: turn.reply, reading: turn.reading ?? null, translation: turn.translation })
    .select("id, role, content, reading, translation, created_at")
    .single();
  await admin.from("conversation_sessions").update({ updated_at: new Date().toISOString() }).eq("id", id);

  // Shared learner model updates.
  const used = await vocabIdsInText(admin, b.content, scenario.language);
  const flagged = normalize(turn.corrections.map((c) => c.original).join(" "));
  const vocabRows = used.length ? (await admin.from("vocabulary_items").select("id, lemma").in("id", used)).data ?? [] : [];
  await recordAnswers(
    admin,
    user.id,
    vocabRows.map((v) => ({ vocabId: v.id, skill: "production" as const, correct: !flagged.includes(normalize(v.lemma)), weight: b.viaVoice ? 0.8 : 0.6 })),
    "talk",
    null,
    { session_id: id, via_voice: b.viaVoice },
  );
  const heard = await vocabIdsInText(admin, turn.reply, scenario.language);
  if (heard.length) await recordExposure(admin, user.id, heard, "listening", "talk");
  await logEvent(admin, user.id, { activity: "talk", event_type: b.viaVoice ? "voice_message" : "message", meta: { session_id: id, words_used: used.length } });

  return { userMessage: userMsg, reply, wordsUsed: vocabRows.map((v) => v.lemma) };
});
