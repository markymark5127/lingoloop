"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Flame, Play, Sparkles } from "lucide-react";
import { api } from "@/lib/client/api";
import { ErrorBox, Spinner } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n/core";
import { useTarget } from "@/lib/lang/client";
import type { TargetLang } from "@/lib/lang";

interface ContentItem {
  id: string;
  title: string;
  genre: string;
  summary: string | null;
  body: { scenes?: unknown[]; chapters?: { paragraphs: { es: string }[] }[] };
  media: { kind: string; public_url: string | null; duration_ms: number | null }[];
  progress: { position: number; completed: boolean; bookmarked: boolean } | null;
  recommendation: { reasons: string[] };
}
interface ProgressData {
  dailyGoalMinutes: number;
  todayMinutes: number;
  streak: number;
  vocabulary: { counts: { due: number; seen: number; strong: number } };
  recommendations: { title: string; detail: string; href: string }[];
}
interface Me {
  displayName: string;
}

const SUBTITLES: Record<TargetLang, string[]> = {
  es: ["A little Spanish goes a long way.", "Poco a poco se va lejos.", "Every word you learn opens a door.", "Today is a great day to learn."],
  ja: ["A little Japanese goes a long way.", "ちりも積もれば山となる — every little bit adds up.", "Every word you learn opens a door.", "Today is a great day to learn."],
};
const BUBBLES: Record<TargetLang, [string, string]> = { es: ["¡Hola!", "Muy bien"], ja: ["こんにちは！", "すごい！"] };
const GENRE_EMOJI: Record<string, string> = { mystery: "🕵️", "sci-fi": "🚀", travel: "🏰", comedy: "😂", romance: "💌", food: "🥘", everyday: "☕", adventure: "🗺️" };

function greeting(h: number, lang: TargetLang, name?: string) {
  if (lang === "ja") {
    const g = h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
    return `${name ? `${name}さん、` : ""}${g}！`;
  }
  const g = h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
  return `¡${g}${name ? `, ${name}` : ""}!`;
}
const minutes = (ms: number | null | undefined) => Math.max(1, Math.round((ms ?? 60000) / 60000));
const readMinutes = (s: ContentItem) => Math.max(1, Math.round((s.body.chapters ?? []).flatMap((c) => c.paragraphs).reduce((n, p) => n + p.es.split(/\s+/).length, 0) / 90));

export default function Dashboard() {
  const [data, setData] = useState<{ p: ProgressData; videos: ContentItem[]; stories: ContentItem[]; me: Me } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const t = useT();
  const locale = useLocale();
  const lang = useTarget();

  const load = useCallback(async () => {
    try {
      const [p, v, s, me] = await Promise.all([
        api<ProgressData>(`/api/progress?tz=${new Date().getTimezoneOffset()}`),
        api<{ items: ContentItem[] }>("/api/content?kind=video"),
        api<{ items: ContentItem[] }>("/api/content?kind=story"),
        api<Me>("/api/me"),
      ]);
      setData({ p, videos: v.items.filter((i) => i.media.some((m) => m.kind === "video")), stories: s.items, me });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch dashboard data on mount
    load();
  }, [load]);

  const weekday = now.toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", { weekday: "long" }).toUpperCase();
  const firstName = data?.me.displayName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-6 md:px-6 md:py-8">
      {/* Greeting */}
      <header className="animate-rise flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-accent">{weekday} · {t("YOUR DAILY IMMERSION")}</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-extrabold md:text-[56px] md:leading-[1.05]">
            {greeting(now.getHours(), lang, firstName)}
            <Sparkles className="h-8 w-8 fill-accent/80 text-accent md:h-10 md:w-10" aria-hidden />
          </h1>
          <p className="mt-2 text-lg text-muted">{t(SUBTITLES[lang][now.getDate() % SUBTITLES[lang].length])}</p>
        </div>
        {data && (
          <div className="glass flex items-center gap-2 rounded-full px-5 py-3 font-semibold">
            <Flame className="h-6 w-6 fill-orange-400 text-orange-500" aria-hidden />
            {data.p.streak > 0 ? t("{n} day streak", { n: data.p.streak }) : t("Start your streak")}
          </div>
        )}
      </header>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && (
        <div className="grid h-72 place-items-center">
          <Spinner label={t("Preparing your immersion…")} />
        </div>
      )}
      {data && <Content {...data} t={t} />}
    </div>
  );
}

function Content({ p, videos, stories, t }: { p: ProgressData; videos: ContentItem[]; stories: ContentItem[]; t: T }) {
  const lang = useTarget();
  const inProgress = stories.find((s) => s.progress && !s.progress.completed && s.progress.position > 0);
  const topVideo = videos[0];
  const topStory = inProgress ?? stories[0];
  const continueHref = inProgress ? `/stories/${inProgress.id}` : p.vocabulary.counts.due > 0 ? "/games?mode=review" : p.recommendations[0]?.href ?? "/videos";
  const pitch = inProgress
    ? t('Pick up "{title}" where you left off.', { title: inProgress.title })
    : p.vocabulary.counts.due > 0
      ? t(p.vocabulary.counts.due === 1 ? "{n} word is ready for review — then new stories and conversations await." : "{n} words are ready for review — then new stories and conversations await.", { n: p.vocabulary.counts.due })
      : t("New words, stories and conversations await — all picked for your level.");
  const goalPct = Math.min(100, (p.todayMinutes / p.dailyGoalMinutes) * 100);

  return (
    <>
      {/* Hero */}
      <section className="glass animate-rise relative overflow-hidden rounded-[36px] p-7 md:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-2/20 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-accent">
              <Sparkles className="h-4 w-4 fill-accent text-accent" aria-hidden /> {t("MADE JUST FOR YOU")}
            </p>
            <h2 className="font-display text-3xl font-extrabold leading-[1.08] md:text-[44px]">
              {t("Your next adventure")}
              <br />
              {t("starts here.")}
            </h2>
            <p className="max-w-md text-lg leading-relaxed text-muted">{pitch}</p>
            <Link href={continueHref} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent-gradient px-7 text-[17px] font-semibold text-white shadow-xl shadow-accent/35 transition hover:brightness-110">
              {t("Continue learning")} <ArrowUpRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
          <div className="relative mx-auto hidden h-64 w-full max-w-sm sm:block" aria-hidden>
            <div className="orb absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2" />
            <span className="glass-strong animate-bubble absolute left-0 top-6 rounded-[22px] rounded-bl-md px-5 py-3 text-xl font-semibold">
              {BUBBLES[lang][0]} <span className="emoji">👋</span>
            </span>
            <span className="glass-strong animate-bubble absolute bottom-6 right-0 rounded-[22px] rounded-br-md px-5 py-3 text-xl font-semibold [animation-delay:1.5s]">
              {BUBBLES[lang][1]} <span className="emoji">✨</span>
            </span>
          </div>
        </div>
      </section>

      {/* Explore */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-extrabold">{t("Explore your world")}</h2>
          <Link href="/videos" className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            {t("View all")} <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topVideo && (
            <ExploreCard
              href={`/videos?start=${topVideo.id}`}
              tag={t("WATCH")}
              title={topVideo.title}
              meta={`${t("Short video")} · ${t("{n} min", { n: minutes(topVideo.media.find((m) => m.kind === "video")?.duration_ms) })}`}
              art="from-[#ffd6c9] via-[#ffc8d8] to-[#f3c9ff]"
              play
              emoji={(topVideo.body.scenes?.[0] as { emoji?: string } | undefined)?.emoji ?? "🎬"}
            />
          )}
          {topStory && (
            <ExploreCard
              href={`/stories/${topStory.id}`}
              tag={t("READ")}
              title={topStory.title}
              meta={`${inProgress ? t("Continue story") : t("Immersive story")} · ${t("{n} min", { n: readMinutes(topStory) })}`}
              art="from-[#d9d4ff] via-[#cbd8ff] to-[#e3d2ff]"
              emoji={GENRE_EMOJI[topStory.genre] ?? "📖"}
            />
          )}
          <ExploreCard
            href={p.vocabulary.counts.due > 0 ? "/games?mode=review" : "/games"}
            tag={t("PLAY")}
            title={p.vocabulary.counts.due > 0 ? t("Review your words") : t("Find the fruit")}
            meta={`${t("Vocabulary game")} · ${p.vocabulary.counts.due > 0 ? t("{n} due", { n: p.vocabulary.counts.due }) : t("{n} min", { n: 3 })}`}
            art="from-[#c9f5ea] via-[#cdeefd] to-[#d8f7d4]"
            emoji="🍊"
          />
        </div>
      </section>

      {/* Daily goal */}
      <section className="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-full px-6 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 fill-accent text-accent" aria-hidden /> {t("Daily goal")}
        </span>
        <div className="h-3 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(goalPct)} aria-valuemin={0} aria-valuemax={100} aria-label={t("Daily goal progress")}>
          <div className="h-full rounded-full bg-gradient-to-r from-accent via-accent-2 to-accent-3 transition-all" style={{ width: `${Math.max(2, goalPct)}%` }} />
        </div>
        <span className="font-display text-lg font-extrabold">
          {p.todayMinutes} <span className="font-semibold text-muted">/ {t("{n} min", { n: p.dailyGoalMinutes })}</span>
        </span>
      </section>
    </>
  );
}

function ExploreCard({ href, tag, title, meta, art, emoji, play }: { href: string; tag: string; title: string; meta: string; art: string; emoji?: string; play?: boolean }) {
  return (
    <Link href={href} className="glass group overflow-hidden rounded-[28px] transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-accent/15">
      <div className={`relative h-44 overflow-hidden bg-gradient-to-br ${art}`}>
        <span className="emoji absolute inset-0 grid place-items-center text-[88px] drop-shadow-[0_18px_24px_rgba(60,40,140,0.25)] transition duration-500 group-hover:scale-110">{emoji}</span>
        <span className="glass-strong absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold tracking-wider">{tag}</span>
        <span className="absolute bottom-4 right-4 grid h-12 w-12 place-items-center rounded-full bg-white text-[#15123a] shadow-lg transition group-hover:scale-110">
          {play ? <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden /> : <ArrowUpRight className="h-5 w-5" aria-hidden />}
        </span>
      </div>
      <div className="px-5 pb-5 pt-4">
        <p className="font-display text-xl font-bold group-hover:text-accent">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{meta}</p>
      </div>
    </Link>
  );
}
