import { z } from "zod";
import { route, requireUser, parseJson } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { GENRES } from "@/lib/content/schemas";
import { CEFR_LEVELS } from "@/lib/engine/level";
import { LOCALES, toLocale } from "@/lib/i18n/core";
import { HttpError } from "@/lib/api/http";
import { TARGET_LANGUAGES, allowedTargets } from "@/lib/lang";

const Body = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  nativeLanguage: z.enum(LOCALES).optional(),
  targetLanguage: z.enum(TARGET_LANGUAGES).optional(),
  level: z.enum(CEFR_LEVELS),
  interests: z.array(z.enum(GENRES)).min(1).max(GENRES.length),
  dailyGoalMinutes: z.number().int().min(5).max(120),
  showTranslations: z.boolean().optional(),
  /** when switching target language, restore the level previously reached in it */
  levelFromHistory: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const b = await parseJson(req, Body);
  const db = await supabaseServer(); // RLS: can only update own row
  const { data: current } = await db.from("learning_profiles").select("native_language, target_language, level, levels").eq("user_id", user.id).single();
  const native = toLocale(b.nativeLanguage ?? current?.native_language);
  const target = b.targetLanguage ?? (current?.target_language as "es" | "ja" | undefined) ?? "es";
  if (!allowedTargets(native).includes(target)) throw new HttpError(400, "That language combination isn't available yet.");
  // Each target language keeps its own level; switching restores the level you had there.
  const levels: Record<string, string> = { ...((current?.levels as Record<string, string> | null) ?? {}) };
  if (current?.target_language && current.target_language !== target) levels[current.target_language] = current.level;
  const switching = current?.target_language !== target;
  const level = switching && b.levelFromHistory ? (levels[target] ?? b.level) : b.level;
  levels[target] = level;
  const { error } = await db
    .from("learning_profiles")
    .update({
      ...(b.nativeLanguage ? { native_language: b.nativeLanguage } : {}),
      target_language: target,
      level,
      levels,
      interests: b.interests,
      daily_goal_minutes: b.dailyGoalMinutes,
      show_translations: b.showTranslations ?? false,
      onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) throw error;
  if (b.displayName) await db.from("profiles").update({ display_name: b.displayName }).eq("id", user.id);
  return { ok: true, level, targetLanguage: target };
});
