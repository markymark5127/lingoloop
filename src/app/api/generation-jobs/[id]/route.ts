import { route, requireUser, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = await supabaseServer();
  const { data } = await db.from("generation_jobs").select("id, kind, status, progress, error, content_id, created_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) throw new HttpError(404, "Not found");
  return { job: data };
});
