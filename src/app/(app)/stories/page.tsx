"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useActivityTimer } from "@/lib/client/useActivityTimer";
import { GenerateButton } from "@/components/GenerateButton";
import { Chip, EmptyState, ErrorBox, Spinner } from "@/components/ui";

interface StoryItem {
  id: string;
  title: string;
  genre: string;
  cefr: string;
  summary: string | null;
  series: string | null;
  series_order: number | null;
  source: string;
  body: { chapters: { title: string }[] };
  progress: { position: number; completed: boolean; bookmarked: boolean } | null;
  recommendation: { reasons: string[]; counts: Record<string, number> };
}

const GENRE_ICON: Record<string, string> = { mystery: "🕵️", "sci-fi": "🚀", travel: "✈️", comedy: "😂", romance: "💘", food: "🌮", everyday: "☕", adventure: "🗺️" };
const GENRES = ["mystery", "sci-fi", "travel", "comedy", "everyday"];

export default function StoriesPage() {
  useActivityTimer("story");
  const router = useRouter();
  const [items, setItems] = useState<StoryItem[] | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({ kind: "story" });
      if (genre) q.set("genre", genre);
      setItems((await api<{ items: StoryItem[] }>(`/api/content?${q}`)).items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [genre]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data on mount / when filters change
    load();
  }, [load]);

  const continuing = items?.filter((s) => s.progress && !s.progress.completed && (s.progress.position > 0 || s.progress.bookmarked)) ?? [];
  const rest = items?.filter((s) => !continuing.includes(s)) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Stories</h1>
          <p className="text-muted">Narrated, serialized, and picked for your level.</p>
        </div>
        <GenerateButton kind="story" genre={genre ?? undefined} label="Write me a story" onReady={(id) => router.push(`/stories/${id}`)} />
      </header>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={!genre} onClick={() => setGenre(null)}>All</Chip>
        {GENRES.map((g) => (
          <Chip key={g} active={genre === g} onClick={() => setGenre(g)}>
            <span className="emoji">{GENRE_ICON[g]}</span> {g}
          </Chip>
        ))}
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!items && !error && <Spinner label="Loading stories…" />}
      {items?.length === 0 && <EmptyState emoji="📚" title="No stories in this genre yet">Generate one written just for you.</EmptyState>}

      {continuing.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold">Continue reading</h2>
          {continuing.map((s) => <StoryCard key={s.id} s={s} />)}
        </section>
      )}
      {rest.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold">Recommended for you</h2>
          {rest.map((s) => <StoryCard key={s.id} s={s} />)}
        </section>
      )}
    </div>
  );
}

function StoryCard({ s }: { s: StoryItem }) {
  const pct = s.progress ? (s.progress.completed ? 100 : Math.round((s.progress.position / s.body.chapters.length) * 100)) : 0;
  return (
    <Link href={`/stories/${s.id}`} className="group flex gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="grid h-20 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent-2/80 to-accent/80 text-3xl">
        <span className="emoji">{GENRE_ICON[s.genre] ?? "📖"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
          <span className="rounded-full bg-surface-2 px-2 py-0.5">{s.cefr}</span>
          {s.series && s.series_order && <span>Episode {s.series_order}</span>}
          <span>{s.body.chapters.length} ch.</span>
          {s.progress?.bookmarked && <span>🔖</span>}
          {s.progress?.completed && <span className="text-success">✓ Read</span>}
          {s.source !== "starter" && <span className="text-accent">made for you</span>}
        </div>
        <h3 className="mt-1 font-display text-lg font-bold group-hover:text-accent">{s.title}</h3>
        <p className="line-clamp-2 text-sm text-muted">{s.summary}</p>
        {s.recommendation.reasons[0] && <p className="mt-1 text-xs font-medium text-accent-2">🎯 {s.recommendation.reasons[0]}</p>}
        {pct > 0 && pct < 100 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
