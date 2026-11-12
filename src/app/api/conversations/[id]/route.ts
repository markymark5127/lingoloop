import { route, requireUser, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { getScenario, publicScenario } from "@/lib/content/scenarios";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userLocale } from "@/lib/learning/service";
import { aiMode } from "@/lib/ai";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = await supabaseServer(); // RLS: another user's session id returns nothing
  const { data: session } = await db.from("conversation_sessions").select("*").eq("id", id).maybeSingle();
  if (!session) throw new HttpError(404, "Conversation not found");
  const { data: messages } = await db.from("conversation_messages").select("id, role, content, reading, translation, via_voice, created_at").eq("session_id", id).eq("user_id", user.id).order("created_at");
  const s = getScenario(session.scenario);
  const locale = await userLocale(supabaseAdmin(), user.id);
  return { session, scenario: s && publicScenario(s, locale), language: s?.language ?? "es", messages: messages ?? [], aiMode: aiMode() };
});
