import { route, requireUser, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { publicQuestions, type Question } from "@/lib/content/schemas";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = await supabaseServer();
  const { data: c } = await db.from("content_items").select("*, media_assets(kind, public_url, duration_ms, meta)").eq("id", id).maybeSingle();
  if (!c) throw new HttpError(404, "Not found");
  const { data: progress } = await db.from("content_progress").select("*").eq("user_id", user.id).eq("content_id", id).maybeSingle();
  const body = c.body as { questions?: Question[]; chapters?: { questions: Question[] }[] };
  let next: { id: string; title: string } | null = null;
  if (c.series) {
    const { data } = await db.from("content_items").select("id, title").eq("series", c.series).gt("series_order", c.series_order ?? 0).order("series_order").limit(1).maybeSingle();
    next = data;
  }
  return {
    ...c,
    body: { ...body, questions: body.questions && publicQuestions(body.questions), chapters: body.chapters?.map((ch) => ({ ...ch, questions: publicQuestions(ch.questions) })) },
    progress,
    next,
  };
});
