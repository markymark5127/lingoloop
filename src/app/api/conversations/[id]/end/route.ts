import { route, requireUser, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getScenario } from "@/lib/content/scenarios";
import { ai } from "@/lib/ai";
import { logEvent, userLocale } from "@/lib/learning/service";

/** End the session and produce the concise feedback summary. */
export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { data: session } = await admin.from("conversation_sessions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!session) throw new HttpError(404, "Conversation not found");
  if (session.status === "ended" && session.summary) return { summary: session.summary };
  const scenario = getScenario(session.scenario)!;
  const { data: msgs } = await admin.from("conversation_messages").select("role, content, feedback").eq("session_id", id).order("created_at");
  const transcript = (msgs ?? []).map((m) => ({ role: m.role === "user" ? "Learner" : scenario.character, content: m.content, corrections: m.feedback?.corrections }));
  const nativeLanguage = await userLocale(admin, user.id);
  const summary = await ai().summarize({ scenario, level: session.level, nativeLanguage, transcript: transcript.map((t) => ({ ...t, role: t.role === "Learner" ? "user" : "assistant" })) });
  await admin.from("conversation_sessions").update({ status: "ended", summary, updated_at: new Date().toISOString() }).eq("id", id);
  await logEvent(admin, user.id, { activity: "talk", event_type: "session_ended", meta: { session_id: id } });
  return { summary };
});
