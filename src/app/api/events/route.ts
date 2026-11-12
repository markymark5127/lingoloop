import { z } from "zod";
import { route, requireUser, parseJson, rateLimit } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Body = z.object({ activity: z.enum(["video", "story", "game", "talk"]), seconds: z.number().int().min(1).max(60) });

/** Active-time heartbeat (sent while a tab is visible and in use). Time is tracked, but never drives level. */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`events:${user.id}`, 12);
  const b = await parseJson(req, Body);
  await supabaseAdmin().from("learning_events").insert({ user_id: user.id, activity: b.activity, event_type: "active_time", seconds: b.seconds });
  return { ok: true };
});
