import { route, requireUser, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { getScenario } from "@/lib/content/scenarios";
import { aiMode } from "@/lib/ai";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = await supabaseServer(); // RLS: another user's session id returns nothing
  const { data: session } = await db.from("conversation_sessions").select("*").eq("id", id).maybeSingle();
  if (!session) throw new HttpError(404, "Conversation not found");
  const { data: messages } = await db.from("conversation_messages").select("id, role, content, translation, via_voice, created_at").eq("session_id", id).eq("user_id", user.id).order("created_at");
  const s = getScenario(session.scenario);
  return { session, scenario: s && { id: s.id, title: s.title, emoji: s.emoji, character: s.character, goal: s.goal }, messages: messages ?? [], aiMode: aiMode() };
});
