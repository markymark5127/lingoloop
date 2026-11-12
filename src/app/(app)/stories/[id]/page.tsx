"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { speak, stopSpeaking } from "@/lib/client/speech";
import { sentences } from "@/lib/engine/text";
import { useActivityTimer } from "@/lib/client/useActivityTimer";
import { WordTapText } from "@/components/WordTapText";
import { Quiz, type PublicQuestion } from "@/components/Quiz";
import { Button, ErrorBox, Spinner } from "@/components/ui";

interface Story {
  id: string;
  title: string;
  genre: string;
  cefr: string;
  summary: string;
  series: string | null;
  series_order: number | null;
  body: { characters: string[]; chapters: { title: string; paragraphs: { es: string; en: string }[]; questions: PublicQuestion[] }[] };
  progress: { position: number; completed: boolean; bookmarked: boolean } | null;
  next: { id: string; title: string } | null;
}

export default function StoryReader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  useActivityTimer("story");
  const [story, setStory] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0);
  const [showEn, setShowEn] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [reading, setReading] = useState<{ p: number; s: number } | null>(null);
  const [rate, setRate] = useState(0.95);
  const [quizDone, setQuizDone] = useState(false);
  const stopFlag = useRef(false);

  const load = useCallback(async () => {
    try {
      const s = await api<Story>(`/api/content/${id}`);
      setStory(s);
      setBookmarked(!!s.progress?.bookmarked);
      setChapter(Math.min(s.body.chapters.length - 1, Math.floor(s.progress?.position ?? 0)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data on mount / when filters change
    load();
    return () => {
      stopFlag.current = true;
      stopSpeaking();
    };
  }, [load]);

  const save = (patch: Record<string, unknown>) => api(`/api/content/${id}/progress`, { method: "POST", json: patch }).catch(() => {});

  async function narrate() {
    if (!story) return;
    if (reading) {
      stopFlag.current = true;
      stopSpeaking();
      setReading(null);
      return;
    }
    stopFlag.current = false;
    const paras = story.body.chapters[chapter].paragraphs;
    for (let p = 0; p < paras.length; p++) {
      const ss = sentences(paras[p].es);
      for (let s = 0; s < ss.length; s++) {
        if (stopFlag.current) return;
        setReading({ p, s });
        await speak(ss[s], { rate });
      }
    }
    setReading(null);
  }

  function goChapter(n: number) {
    stopFlag.current = true;
    stopSpeaking();
    setReading(null);
    setQuizDone(false);
    setChapter(n);
    save({ position: n });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (error) return <div className="p-4"><ErrorBox message={error} onRetry={load} /></div>;
  if (!story) return <div className="grid h-64 place-items-center"><Spinner label="Opening story…" /></div>;

  const ch = story.body.chapters[chapter];
  const last = chapter === story.body.chapters.length - 1;

  return (
    <article className="mx-auto max-w-2xl px-4 pb-10 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/stories" className="rounded-lg px-2 py-1 text-sm font-medium text-muted hover:text-text">← Stories</Link>
        <div className="flex gap-1">
          <button onClick={() => setShowEn(!showEn)} aria-pressed={showEn} aria-label="Show English translation" className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${showEn ? "bg-accent-2 text-white" : "bg-surface-2"}`}>EN</button>
          <button onClick={() => { setBookmarked(!bookmarked); save({ bookmarked: !bookmarked }); }} aria-label={bookmarked ? "Remove bookmark" : "Bookmark story"} aria-pressed={bookmarked} className="min-h-10 rounded-xl bg-surface-2 px-3">
            <span className="emoji">{bookmarked ? "🔖" : "📑"}</span>
          </button>
        </div>
      </div>

      <header className="mb-6">
        <p className="text-sm font-medium text-muted">
          {story.series && story.series_order ? `${story.series} · Episode ${story.series_order} · ` : ""}
          {story.cefr} · Chapter {chapter + 1}/{story.body.chapters.length}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight">{story.title}</h1>
        <h2 className="mt-1 text-xl font-semibold text-accent">{ch.title}</h2>
      </header>

      <div className="sticky top-14 z-20 -mx-4 mb-6 flex items-center gap-2 bg-bg/90 px-4 py-2 backdrop-blur md:top-0">
        <Button onClick={narrate} className="min-w-36">
          {reading ? "⏸ Stop" : "🔊 Listen"}
        </Button>
        <button onClick={() => setRate(rate === 0.95 ? 0.7 : 0.95)} className="min-h-11 rounded-xl bg-surface-2 px-3 text-sm font-semibold" aria-label="Narration speed">
          {rate < 0.9 ? "🐢 Slow" : "🐇 Normal"}
        </button>
        <span className="text-xs text-muted">Tap any word for its meaning</span>
      </div>

      <div className="space-y-6 font-serif text-[1.3rem] leading-relaxed">
        {ch.paragraphs.map((para, pi) => (
          <div key={pi}>
            <p>
              {sentences(para.es).map((s, si) => (
                <span key={si} className={`rounded transition-colors ${reading?.p === pi && reading.s === si ? "bg-warning/35" : ""}`}>
                  <WordTapText text={s} />{" "}
                </span>
              ))}
            </p>
            {showEn && <p className="mt-1 font-sans text-base text-muted">{para.en}</p>}
          </div>
        ))}
      </div>

      <section className="mt-10 rounded-3xl border border-border bg-surface p-5">
        <h3 className="mb-4 font-display text-lg font-bold">Comprehension check</h3>
        <Quiz
          key={chapter}
          contentId={story.id}
          chapter={chapter}
          questions={ch.questions}
          onDone={() => {
            setQuizDone(true);
            if (last) save({ completed: true, position: chapter + 1 });
          }}
        />
      </section>

      <nav className="mt-6 flex gap-3">
        {chapter > 0 && <Button variant="secondary" onClick={() => goChapter(chapter - 1)}>← Previous</Button>}
        {!last && <Button className="flex-1" onClick={() => goChapter(chapter + 1)}>Next chapter →</Button>}
        {last && quizDone && story.next && (
          <Link href={`/stories/${story.next.id}`} className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-accent font-semibold text-white">
            Next episode: {story.next.title} →
          </Link>
        )}
        {last && !quizDone && (
          <Button variant="secondary" className="flex-1" onClick={() => save({ completed: true, position: chapter + 1 })}>
            Mark as finished
          </Button>
        )}
      </nav>
    </article>
  );
}
