import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GENRES } from "@/lib/content/schemas";

const Body = z.object({ kind: z.enum(["video", "story"]), genre: z.enum(GENRES).optional() });
const DAILY_LIMIT = Number(process.env.DAILY_GENERATION_LIMIT ?? 10);

/** Queue personalized content generation. The media worker picks it up asynchronously. */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`gen:${user.id}`, 4);
  const b = await parseJson(req, Body);
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("generation_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, `Daily generation limit reached (${DAILY_LIMIT}). Try again tomorrow.`);
  const { data: active } = await admin.from("generation_jobs").select("id").eq("user_id", user.id).in("status", ["queued", "running"]).limit(3);
  if ((active?.length ?? 0) >= 2) throw new HttpError(429, "You already have content being generated — hang tight!");
  const { data, error } = await admin.from("generation_jobs").insert({ user_id: user.id, kind: b.kind, input: { genre: b.genre } }).select("id, status").single();
  if (error) throw error;
  return { job: data };
});
