"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Card, ErrorBox, ProgressBar, Spinner } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n/client";

interface Progress {
  level: string;
  levelDecision: { level: string; change: string; reason: string };
  dailyGoalMinutes: number;
  todayMinutes: number;
  streak: number;
  time: { totalMinutes: number; byActivity: Record<string, number> };
  history: { date: string; minutes: number }[];
  vocabulary: {
    counts: { seen: number; strong: number; developing: number; needsPractice: number; due: number; saved: number };
    words: { vocabId: string; lemma: string; translation: string; emoji: string | null; label: string; mastery: number; due: boolean; saved: boolean; skills: Record<string, string> }[];
  };
  performance: { comprehension: { correct: number; total: number }; games: { correct: number; total: number }; skills: { reading: number; listening: number; speaking: number } };
  recommendations: { title: string; detail: string; href: string }[];
}

const ACT = [
  { k: "video", label: "Watching", icon: "🎬", color: "bg-accent" },
  { k: "story", label: "Reading", icon: "📖", color: "bg-accent-2" },
  { k: "game", label: "Playing", icon: "🎮", color: "bg-warning" },
  { k: "talk", label: "Speaking", icon: "💬", color: "bg-success" },
];
const LABEL: Record<string, { text: string; cls: string }> = {
  strong: { text: "Strong", cls: "bg-success-soft text-success" },
  developing: { text: "Developing", cls: "bg-warning/15 text-warning" },
  "needs-practice": { text: "Needs practice", cls: "bg-danger-soft text-danger" },
  new: { text: "New", cls: "bg-surface-2 text-muted" },
};
const pct = (a: { correct: number; total: number }) => (a.total ? Math.round((a.correct / a.total) * 100) : null);

export default function ProgressPage() {
  const t = useT();
  const locale = useLocale();
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "due" | "saved">("all");

  const load = useCallback(() => {
    api<Progress>(`/api/progress?tz=${new Date().getTimezoneOffset()}`).then(setP, (e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <div className="p-4"><ErrorBox message={error} onRetry={load} /></div>;
  if (!p) return <div className="grid h-64 place-items-center"><Spinner label={t("Crunching your progress…")} /></div>;

  const goalPct = Math.min(100, (p.todayMinutes / p.dailyGoalMinutes) * 100);
  const maxDay = Math.max(p.dailyGoalMinutes, ...p.history.map((h) => h.minutes));
  const words = p.vocabulary.words.filter((w) => (filter === "due" ? w.due : filter === "saved" ? w.saved : true));

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header>
        <h1 className="font-display text-4xl font-extrabold">{t("Progress")}</h1>
        <p className="text-muted">{t("Time is tracked — but only performance and retention move your level.")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-center gap-5">
            <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--accent) ${goalPct * 3.6}deg, var(--surface-2) 0)` }}>
              <div className="grid h-[5.5rem] w-[5.5rem] place-items-center rounded-full bg-surface text-center">
                <span>
                  <span className="block font-display text-2xl font-extrabold">{p.todayMinutes}</span>
                  <span className="text-xs text-muted">/ {t("{n} min", { n: p.dailyGoalMinutes })}</span>
                </span>
              </div>
            </div>
            <div>
              <p className="font-display text-xl font-bold">{goalPct >= 100 ? `${t("Daily goal complete!")} 🎉` : t("Today's goal")}</p>
              <p className="text-sm text-muted">{p.streak > 0 ? `🔥 ${t("{n} day streak", { n: p.streak })}` : t("Hit your goal to start a streak")}</p>
              <p className="mt-1 text-sm text-muted">{t("{n} total active minutes", { n: p.time.totalMinutes })}</p>
            </div>
          </div>
          <div className="mt-5 flex h-24 items-end gap-1.5" aria-label={t("Minutes per day, last 14 days")}>
            {p.history.map((h) => (
              <div key={h.date} className="flex flex-1 flex-col items-center gap-1" title={`${h.date}: ${t("{n} min", { n: h.minutes })}`}>
                <div className={`w-full rounded-t-md ${h.minutes >= p.dailyGoalMinutes ? "bg-accent" : "bg-accent/35"}`} style={{ height: `${Math.max(3, (h.minutes / maxDay) * 80)}px` }} />
                <span className="text-[9px] text-muted">{new Date(h.date + "T12:00:00").toLocaleDateString(locale === "ja" ? "ja-JP" : undefined, { weekday: "narrow" })}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-sm font-medium text-muted">{t("Current band")}</p>
          <p className="font-display text-5xl font-extrabold">{p.level}</p>
          <p className="mt-2 text-sm text-muted">{p.levelDecision.reason}</p>
          <p className="mt-3 text-[11px] text-muted">{t("CEFR bands are approximate difficulty levels, not a certification.")}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold">{t("Time by activity")}</h2>
          <div className="space-y-3">
            {ACT.map((a) => {
              const v = p.time.byActivity[a.k] ?? 0;
              return (
                <div key={a.k}>
                  <div className="flex justify-between text-sm"><span><span className="emoji">{a.icon}</span> {t(a.label)}</span><span className="font-semibold">{t("{n} min", { n: v })}</span></div>
                  <ProgressBar value={p.time.totalMinutes ? (v / p.time.totalMinutes) * 100 : 0} color={a.color} />
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold">{t("Skill estimates")}</h2>
          <div className="space-y-3">
            {(["reading", "listening", "speaking"] as const).map((k) => (
              <div key={k}>
                <div className="flex justify-between text-sm capitalize"><span>{t(k)}</span><span className="font-semibold">{p.performance.skills[k]}%</span></div>
                <ProgressBar value={p.performance.skills[k]} color="bg-accent-2" />
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-xl bg-surface-2 p-2"><p className="font-display text-xl font-bold">{pct(p.performance.comprehension) ?? "—"}{pct(p.performance.comprehension) !== null && "%"}</p><p className="text-xs text-muted">{t("Comprehension")} ({p.performance.comprehension.total})</p></div>
            <div className="rounded-xl bg-surface-2 p-2"><p className="font-display text-xl font-bold">{pct(p.performance.games) ?? "—"}{pct(p.performance.games) !== null && "%"}</p><p className="text-xs text-muted">{t("Game accuracy")} ({p.performance.games.total})</p></div>
          </div>
        </Card>
      </div>

      {p.recommendations.length > 0 && (
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold">{t("Practice next")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.recommendations.map((r) => (
              <Link key={r.title} href={r.href} className="glass-strong rounded-2xl p-3 transition hover:-translate-y-0.5 hover:text-accent">
                <p className="font-semibold">{r.title} →</p>
                <p className="text-xs text-muted">{r.detail}</p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{t("Vocabulary")}</h2>
          <div className="flex gap-1 text-sm">
            {(["all", "due", "saved"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`rounded-full px-3 py-1 font-medium capitalize ${filter === f ? "bg-accent-gradient text-white" : "bg-surface-2 text-muted"}`}>
                {t(f)} {f === "due" ? `(${p.vocabulary.counts.due})` : f === "saved" ? `(${p.vocabulary.counts.saved})` : `(${p.vocabulary.counts.seen})`}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-success-soft p-2"><p className="font-display text-2xl font-bold text-success">{p.vocabulary.counts.strong}</p><p className="text-xs">{t("Strong")}</p></div>
          <div className="rounded-xl bg-warning/15 p-2"><p className="font-display text-2xl font-bold text-warning">{p.vocabulary.counts.developing}</p><p className="text-xs">{t("Developing")}</p></div>
          <div className="rounded-xl bg-danger-soft p-2"><p className="font-display text-2xl font-bold text-danger">{p.vocabulary.counts.needsPractice}</p><p className="text-xs">{t("Needs practice")}</p></div>
        </div>
        {words.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t("No words here yet — watch, read or play to start building your vocabulary.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-2 pr-2">{t("Word")}</th><th className="px-2">{t("Recognition")}</th><th className="px-2">{t("Listening")}</th><th className="px-2">{t("Usage")}</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {words.slice(0, 60).map((w) => (
                  <tr key={w.vocabId}>
                    <td className="py-2 pr-2">
                      <span className="emoji mr-1">{w.emoji}</span>
                      <b>{w.lemma}</b> <span className="text-muted">{w.translation}</span>
                      {w.due && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] font-bold text-accent">{t("DUE")}</span>}
                      {w.saved && <span className="ml-1">🔖</span>}
                    </td>
                    {(["recognition", "listening", "production"] as const).map((s) => (
                      <td key={s} className="px-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${LABEL[w.skills[s]]?.cls}`}>{t(LABEL[w.skills[s]]?.text ?? "")}</span></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
