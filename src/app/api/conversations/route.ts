import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getScenario, lineTranslation, publicScenario, scenariosFor } from "@/lib/content/scenarios";
import { getProfile, targetOf } from "@/lib/learning/service";
import { toLocale } from "@/lib/i18n/core";

const Body = z.object({ scenario: z.string().max(40) });

export const GET = route(async () => {
  const user = await requireUser();
  const db = await supabaseServer();
  const profile = await getProfile(supabaseAdmin(), user.id);
  const lang = targetOf(profile);
  const locale = toLocale(profile.native_language);
  const { data } = await db
    .from("conversation_sessions")
    .select("id, scenario, character_name, status, created_at, summary")
    .eq("user_id", user.id)
    .eq("language", lang)
    .order("created_at", { ascending: false })
    .limit(20);
  return { scenarios: scenariosFor(lang).map((s) => publicScenario(s, locale)), sessions: data ?? [] };
});

/** Start a roleplay session. The character greets the learner first. */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`conv:${user.id}`, 10);
  const b = await parseJson(req, Body);
  const s = getScenario(b.scenario);
  if (!s) throw new HttpError(400, "Unknown scenario");
  const admin = supabaseAdmin();
  const profile = await getProfile(admin, user.id);
  if (s.language !== targetOf(profile)) throw new HttpError(400, "Unknown scenario");
  const { data, error } = await admin
    .from("conversation_sessions")
    .insert({ user_id: user.id, scenario: s.id, character_name: s.character, level: profile.level, language: s.language })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("conversation_messages").insert({ session_id: data.id, user_id: user.id, role: "assistant", content: s.opening.text, reading: s.opening.reading ?? null, translation: lineTranslation(s.opening, toLocale(profile.native_language)) });
  return { id: data.id };
});
