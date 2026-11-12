import { z } from "zod";
import { route, requireUser, parseJson, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Question } from "@/lib/content/schemas";

const Body = z.object({ chapter: z.number().int().min(0).max(10).optional(), answers: z.array(z.number().int().min(-1).max(3)).min(1).max(4) });

/** Comprehension questions are graded on the server; answers never ship to the browser. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const b = await parseJson(req, Body);
  const db = await supabaseServer();
  const { data: item } = await db.from("content_items").select("id, kind, body").eq("id", id).maybeSingle();
  if (!item) throw new HttpError(404, "Not found");
  const body = item.body as { questions?: Question[]; chapters?: { questions: Question[] }[] };
  const qs = item.kind === "video" ? body.questions : body.chapters?.[b.chapter ?? 0]?.questions;
  if (!qs) throw new HttpError(400, "No questions");
  const results = qs.map((q, i) => ({ correct: b.answers[i] === q.answer, answer: q.answer }));
  const correct = results.filter((r) => r.correct).length;

  const admin = supabaseAdmin();
  const activity = item.kind === "video" ? "video" : "story";
  await admin.from("learning_events").insert(
    results.map((r, i) => ({ user_id: user.id, activity, event_type: "answer", content_id: id, skill: "comprehension", correct: r.correct, meta: { question: i, chapter: b.chapter ?? 0 } })),
  );
  const { data: prev } = await db.from("content_progress").select("quiz_correct, quiz_total").eq("user_id", user.id).eq("content_id", id).maybeSingle();
  await db.from("content_progress").upsert(
    { user_id: user.id, content_id: id, quiz_correct: (prev?.quiz_correct ?? 0) + correct, quiz_total: (prev?.quiz_total ?? 0) + qs.length, updated_at: new Date().toISOString() },
    { onConflict: "user_id,content_id" },
  );
  return { results, correct, total: qs.length };
});
