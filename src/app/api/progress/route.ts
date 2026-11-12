import { route, requireUser } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { eventLanguage, getProfile, loadVocab, localizeVocab, rankedContent, targetOf, type EventLangRow } from "@/lib/learning/service";
import { makeT, toLocale } from "@/lib/i18n/core";
import { label, overall, suggestLevel, weakestSkill, type SkillState } from "@/lib/engine";

/** Aggregated progress. Reads go through the RLS-scoped client (own data only). */
export const GET = route(async (req) => {
  const user = await requireUser();
  const tz = Number(new URL(req.url).searchParams.get("tz") ?? 0); // minutes offset from Date.getTimezoneOffset()
  const db = await supabaseServer();
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const profile = await getProfile(admin, user.id);
  const lang = targetOf(profile);
  const [vocab, timeRows, answerRows, uv, sessions] = await Promise.all([
    loadVocab(admin, lang),
    db.from("learning_events").select("activity, seconds, created_at").eq("user_id", user.id).eq("event_type", "active_time").limit(20000),
    db.from("learning_events").select("activity, skill, correct, created_at, vocabulary_items(language), content_items(language)").eq("user_id", user.id).eq("event_type", "answer").order("created_at", { ascending: false }).limit(2000),
    db.from("user_vocabulary").select("*").eq("user_id", user.id),
    db.from("conversation_sessions").select("id, created_at").eq("user_id", user.id).eq("language", lang).order("created_at", { ascending: false }).limit(1),
  ]);

  const locale = toLocale(profile.native_language);
  const t = makeT(locale);

  // ---- time
  const time = { video: 0, story: 0, game: 0, talk: 0 } as Record<string, number>;
  const dayKey = (iso: string) => new Date(new Date(iso).getTime() - tz * 60000).toISOString().slice(0, 10);
  const perDay = new Map<string, number>();
  for (const r of timeRows.data ?? []) {
    time[r.activity] = (time[r.activity] ?? 0) + r.seconds;
    if (r.created_at >= since) perDay.set(dayKey(r.created_at), (perDay.get(dayKey(r.created_at)) ?? 0) + r.seconds);
  }
  const totalSeconds = Object.values(time).reduce((a, b) => a + b, 0);
  const today = dayKey(new Date().toISOString());
  const history = Array.from({ length: 14 }, (_, i) => {
    const d = dayKey(new Date(Date.now() - (13 - i) * 86400000).toISOString());
    return { date: d, minutes: Math.round((perDay.get(d) ?? 0) / 6) / 10 };
  });
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].minutes >= profile.daily_goal_minutes) streak++;
    else if (i !== history.length - 1) break;
  }

  // ---- vocabulary
  const vById = new Map(vocab.map((v) => [v.id, v]));
  const now = Date.now();
  // Progress is per target language: only words from the language being learned.
  const words = (uv.data ?? []).filter((r) => vById.has(r.vocab_id)).map((r) => {
    const s: SkillState = { recognition: r.recognition, listening: r.listening, production: r.production };
    const raw = vById.get(r.vocab_id);
    const v = raw && localizeVocab(raw, locale);
    return {
      vocabId: r.vocab_id,
      lemma: v?.lemma ?? "?",
      translation: v?.translation ?? "",
      emoji: v?.emoji ?? null,
      saved: r.saved,
      mastery: overall(s),
      label: label(overall(s), r.exposures > 0 || r.correct_count + r.incorrect_count > 0),
      skills: { recognition: label(s.recognition), listening: label(s.listening), production: label(s.production) },
      raw: s,
      due: r.due_at ? new Date(r.due_at).getTime() <= now : false,
      correct: r.correct_count,
      incorrect: r.incorrect_count,
    };
  });
  const counts = {
    seen: words.length,
    strong: words.filter((w) => w.label === "strong").length,
    developing: words.filter((w) => w.label === "developing").length,
    needsPractice: words.filter((w) => w.label === "needs-practice").length,
    due: words.filter((w) => w.due).length,
    saved: words.filter((w) => w.saved).length,
  };

  // ---- performance
  const answers = ((answerRows.data ?? []) as unknown as ({ activity: string; skill: string | null; correct: boolean; created_at: string } & EventLangRow)[]).filter((a) => eventLanguage(a) === lang);
  const acc = (f: (a: (typeof answers)[number]) => boolean) => {
    const sel = answers.filter(f);
    return { correct: sel.filter((a) => a.correct).length, total: sel.length };
  };
  const comprehension = acc((a) => a.skill === "comprehension");
  const games = acc((a) => a.activity === "game");
  const recent = answers.slice(0, 40);
  const avg = (k: keyof SkillState) => (words.length ? words.reduce((s, w) => s + w.raw[k], 0) / words.length : 0);
  const compRate = comprehension.total ? comprehension.correct / comprehension.total : 0;
  const skills = {
    reading: Math.round((avg("recognition") * 0.7 + compRate * 0.3) * 100),
    listening: Math.round(avg("listening") * 100),
    speaking: Math.round(avg("production") * 100),
  };
  const level = suggestLevel({
    current: profile.level,
    strongWords: words.filter((w) => w.mastery >= 0.6).length,
    recentAccuracy: recent.length ? recent.filter((a) => a.correct).length / recent.length : 0,
    recentAnswers: recent.length,
    locale,
  });

  // ---- recommendations
  const recs: { title: string; detail: string; href: string }[] = [];
  if (counts.due > 0) recs.push({ title: t(counts.due === 1 ? "Review {n} word" : "Review {n} words", { n: counts.due }), detail: t("Due for spaced review — quick games will bring them back."), href: "/games?mode=review" });
  const avgSkills: SkillState = { recognition: avg("recognition"), listening: avg("listening"), production: avg("production") };
  if (words.length >= 5) {
    const weak = weakestSkill(avgSkills);
    if (weak === "production") recs.push({ title: t("Practice speaking"), detail: t("Your production is your weakest skill — try a roleplay with the microphone."), href: "/talk" });
    if (weak === "listening") recs.push({ title: t("Train your ear"), detail: t("Listening is lagging — watch a video and play audio-matching games."), href: "/games?type=audio_match" });
  }
  const [topVideo] = await rankedContent(db, admin, user.id, "video");
  const [topStory] = await rankedContent(db, admin, user.id, "story");
  if (topVideo) recs.push({ title: t('Watch "{title}"', { title: topVideo.title }), detail: topVideo.recommendation.reasons[0] ?? t("Picked for you"), href: `/videos?start=${topVideo.id}` });
  if (topStory) recs.push({ title: t('Read "{title}"', { title: topStory.title }), detail: topStory.recommendation.reasons[0] ?? t("Picked for you"), href: `/stories/${topStory.id}` });
  const lastTalk = sessions.data?.[0]?.created_at;
  if (!lastTalk || now - new Date(lastTalk).getTime() > 3 * 86400000) recs.push({ title: t("Have a conversation"), detail: t("It's been a while since you practiced speaking."), href: "/talk" });

  return {
    targetLanguage: lang,
    level: profile.level,
    levelDecision: level,
    dailyGoalMinutes: profile.daily_goal_minutes,
    todayMinutes: Math.round((perDay.get(today) ?? 0) / 6) / 10,
    streak,
    time: { totalMinutes: Math.round(totalSeconds / 6) / 10, byActivity: Object.fromEntries(Object.entries(time).map(([k, v]) => [k, Math.round(v / 6) / 10])) },
    history,
    vocabulary: { counts, words: words.sort((a, b) => Number(b.due) - Number(a.due) || a.mastery - b.mastery).map(({ raw: _r, ...w }) => (void _r, w)) },
    performance: { comprehension, games, skills },
    recommendations: recs.slice(0, 5),
  };
});
