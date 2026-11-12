import { route, requireUser, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rankedContent } from "@/lib/learning/service";
import { publicQuestions, type Question } from "@/lib/content/schemas";

/** Personalized, ranked content. Correct quiz answers are stripped before leaving the server. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "video" && kind !== "story") throw new HttpError(400, "kind must be video or story");
  const genre = url.searchParams.get("genre") || undefined;
  const items = await rankedContent(await supabaseServer(), supabaseAdmin(), user.id, kind, genre);
  return {
    items: items.map((c) => {
      const body = c.body as { questions?: Question[]; chapters?: { questions: Question[] }[] };
      return {
        ...c,
        body: {
          ...body,
          questions: body.questions ? publicQuestions(body.questions) : undefined,
          chapters: body.chapters?.map((ch) => ({ ...ch, questions: publicQuestions(ch.questions) })),
        },
      };
    }),
  };
});
