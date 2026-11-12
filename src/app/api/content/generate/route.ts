import { z } from "zod";
import { route, requireUser, parseJson, rateLimit, HttpError } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GENRES } from "@/lib/content/schemas";
import { getProfile, targetOf } from "@/lib/learning/service";
import { makeT, toLocale } from "@/lib/i18n/core";

const Body = z.object({
  kind: z.enum(["video", "story"]),
  genre: z.enum(GENRES).optional(),
  /** skip the library and always generate something new */
  fresh: z.boolean().optional(),
});
const DAILY_LIMIT = Number(process.env.DAILY_GENERATION_LIMIT ?? 10);

/**
 * "Make me something new".
 *  1. Library first: a ready, shared item at the learner's level (and genre/interests) that they
 *     haven't opened yet. Instant, and costs no AI calls.
 *  2. Otherwise queue a generation job for the media worker. The result is published to the shared
 *     library, so the next learner who asks for the same kind of thing reuses it.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`gen:${user.id}`, 6);
  const b = await parseJson(req, Body);
  const admin = supabaseAdmin();
  const profile = await getProfile(admin, user.id);
  const t = makeT(toLocale(profile.native_language));
  const lang = targetOf(profile);

  if (!b.fresh) {
    const hit = await findInLibrary(admin, user.id, b.kind, lang, profile.level, b.genre ? [b.genre] : profile.interests);
    if (hit) return { reused: true, contentId: hit.id, title: hit.title };
  }

  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("generation_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, t("Daily generation limit reached ({n}). Try again tomorrow.", { n: DAILY_LIMIT }));
  const { data: active } = await admin.from("generation_jobs").select("id, kind, status, progress, error, content_id, input").eq("user_id", user.id).in("status", ["queued", "running"]).limit(3);
  // Same request already in flight for this learner? Hand back that job instead of paying twice.
  const same = active?.find((j) => j.kind === b.kind && ((j as { input?: { language?: string } }).input?.language ?? "es") === lang);
  if (same) return { job: same, joined: true };
  if ((active?.length ?? 0) >= 2) throw new HttpError(429, t("You already have content being generated — hang tight!"));
  const { data, error } = await admin
    .from("generation_jobs")
    .insert({ user_id: user.id, kind: b.kind, input: { genre: b.genre, level: profile.level, language: lang } })
    .select("id, kind, status, progress, error, content_id")
    .single();
  if (error) throw error;
  return { job: data };
});

type Admin = ReturnType<typeof supabaseAdmin>;

async function findInLibrary(admin: Admin, userId: string, kind: "video" | "story", language: string, level: string, genres: string[]) {
  let q = admin
    .from("content_items")
    .select("id, title, genre, media_assets(kind)")
    .eq("language", language)
    .eq("kind", kind)
    .eq("status", "ready")
    .eq("is_public", true)
    .neq("source", "starter") // starter items are already in everyone's feed
    .eq("cefr", level)
    .order("created_at", { ascending: false })
    .limit(60);
  if (genres.length) q = q.in("genre", genres);
  const [{ data: items }, { data: seen }] = await Promise.all([
    q,
    admin.from("content_progress").select("content_id").eq("user_id", userId).limit(5000),
  ]);
  const opened = new Set((seen ?? []).map((s) => s.content_id));
  return (items ?? []).find((c) => !opened.has(c.id) && (kind === "story" || (c.media_assets as { kind: string }[]).some((m) => m.kind === "video"))) ?? null;
}
