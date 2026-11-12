import { z } from "zod";
import { route, requireUser, parseJson } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { GENRES } from "@/lib/content/schemas";
import { CEFR_LEVELS } from "@/lib/engine/level";

const Body = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  nativeLanguage: z.enum(["en"]).default("en"),
  targetLanguage: z.enum(["es"]).default("es"),
  level: z.enum(CEFR_LEVELS),
  interests: z.array(z.enum(GENRES)).min(1).max(GENRES.length),
  dailyGoalMinutes: z.number().int().min(5).max(120),
  showTranslations: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const b = await parseJson(req, Body);
  const db = await supabaseServer(); // RLS: can only update own row
  const { error } = await db
    .from("learning_profiles")
    .update({
      native_language: b.nativeLanguage,
      target_language: b.targetLanguage,
      level: b.level,
      interests: b.interests,
      daily_goal_minutes: b.dailyGoalMinutes,
      show_translations: b.showTranslations ?? false,
      onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) throw error;
  if (b.displayName) await db.from("profiles").update({ display_name: b.displayName }).eq("id", user.id);
  return { ok: true };
});
