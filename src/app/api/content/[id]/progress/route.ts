import { z } from "zod";
import { route, requireUser, parseJson, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordExposure, logEvent } from "@/lib/learning/service";

const Body = z.object({
  position: z.number().min(0).max(100000).optional(),
  completed: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
  liked: z.boolean().optional(),
  skipped: z.boolean().optional(),
});

/** Save engagement. Completion records vocabulary *exposure* (capped), not mastery. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const b = await parseJson(req, Body);
  const db = await supabaseServer();
  const { data: item } = await db.from("content_items").select("id, kind").eq("id", id).maybeSingle();
  if (!item) throw new HttpError(404, "Not found");
  const { data: prev } = await db.from("content_progress").select("completed").eq("user_id", user.id).eq("content_id", id).maybeSingle();
  const { data, error } = await db
    .from("content_progress")
    .upsert({ user_id: user.id, content_id: id, ...b, updated_at: new Date().toISOString() }, { onConflict: "user_id,content_id" })
    .select()
    .single();
  if (error) throw error;

  const admin = supabaseAdmin();
  const activity = item.kind === "video" ? "video" : "story";
  if (b.completed && !prev?.completed) {
    const { data: links } = await admin.from("content_vocabulary").select("vocab_id").eq("content_id", id);
    await recordExposure(admin, user.id, (links ?? []).map((l) => l.vocab_id), item.kind === "video" ? "listening" : "recognition", activity, id);
    await logEvent(admin, user.id, { activity, event_type: "completed", content_id: id });
  }
  for (const k of ["liked", "bookmarked", "skipped"] as const) {
    if (b[k]) await logEvent(admin, user.id, { activity, event_type: k, content_id: id });
  }
  return { progress: data };
});
