"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { useActivityTimer } from "@/lib/client/useActivityTimer";
import { WordTapText } from "@/components/WordTapText";
import { Quiz, type PublicQuestion } from "@/components/Quiz";
import { GenerateButton } from "@/components/GenerateButton";
import { Chip, EmptyState, ErrorBox, Spinner } from "@/components/ui";

interface Scene {
  text: string;
  translation: string;
  emoji: string;
}
interface VideoItem {
  id: string;
  title: string;
  genre: string;
  cefr: string;
  summary: string | null;
  source: string;
  body: { scenes: Scene[]; questions: PublicQuestion[]; timings?: { start: number; end: number }[] };
  media: { kind: string; public_url: string | null; duration_ms: number | null }[];
  progress: { liked: boolean; bookmarked: boolean; completed: boolean } | null;
  recommendation: { reasons: string[] };
}

const GENRES = ["comedy", "mystery", "sci-fi", "travel", "food", "everyday"];

export function VideoFeed() {
  useActivityTimer("video");
  const params = useSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<VideoItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({ kind: "video" });
      if (genre) q.set("genre", genre);
      const { items } = await api<{ items: VideoItem[] }>(`/api/content?${q}`);
      const start = params.get("start");
      const ready = items.filter((i) => i.media.some((m) => m.kind === "video"));
      if (start) ready.sort((a, b) => Number(b.id === start) - Number(a.id === start));
      setItems(ready);
      setActive(0);
      scroller.current?.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [genre, params]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data on mount / when filters change
    load();
  }, [load]);

  // Track which card is on screen.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !items) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

  const next = (i: number) => scroller.current?.querySelector(`[data-index="${i + 1}"]`)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="relative h-dvh bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-20 flex gap-2 overflow-x-auto bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-3 no-scrollbar">
        <Chip active={!genre} onClick={() => setGenre(null)} className={!genre ? "" : "!bg-white/15 !text-white"}>
          For you
        </Chip>
        {GENRES.map((g) => (
          <Chip key={g} active={genre === g} onClick={() => setGenre(g)} className={genre === g ? "" : "!bg-white/15 !text-white"}>
            {g}
          </Chip>
        ))}
      </div>

      {error && (
        <div className="absolute inset-x-4 top-20 z-30">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}
      {!items && !error && (
        <div className="grid h-full place-items-center">
          <Spinner label="Loading your feed…" />
        </div>
      )}

      <div ref={scroller} className="h-full snap-y snap-mandatory overflow-y-scroll no-scrollbar">
        {items?.map((item, i) => (
          <section key={item.id} data-index={i} className="relative flex h-dvh snap-start snap-always items-center justify-center">
            <VideoCard item={item} active={i === active} onNext={() => next(i)} />
          </section>
        ))}
        {items && (
          <section data-index={items.length} className="flex h-dvh snap-start flex-col items-center justify-center gap-4 px-8 text-center">
            {items.length === 0 ? (
              <EmptyState emoji="🎬" title="No videos here yet">
                <span className="text-white/70">Generate one made just for you.</span>
              </EmptyState>
            ) : (
              <>
                <div className="emoji text-6xl">✨</div>
                <h2 className="font-display text-2xl font-bold">You&apos;re all caught up</h2>
                <p className="max-w-xs text-white/70">Generate a fresh video written around your interests and the words you&apos;re practicing.</p>
              </>
            )}
            <GenerateButton kind="video" genre={genre ?? undefined} label="Make me a new video" onReady={(id) => router.push(`/videos?start=${id}`)} />
          </section>
        )}
      </div>
    </div>
  );
}

function VideoCard({ item, active, onNext }: { item: VideoItem; active: boolean; onNext: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [slow, setSlow] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const [liked, setLiked] = useState(!!item.progress?.liked);
  const [bookmarked, setBookmarked] = useState(!!item.progress?.bookmarked);
  const [ended, setEnded] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const completed = useRef(!!item.progress?.completed);
  const src = item.media.find((m) => m.kind === "video")?.public_url ?? undefined;
  const poster = item.media.find((m) => m.kind === "poster")?.public_url ?? undefined;
  const timings = useMemo(() => item.body.timings ?? [], [item.body.timings]);

  const sceneIdx = useMemo(() => {
    const ms = t * 1000;
    let idx = -1;
    timings.forEach((x, i) => {
      if (ms >= x.start - 150) idx = i;
    });
    return idx;
  }, [t, timings]);
  const scene = sceneIdx >= 0 ? item.body.scenes[sceneIdx] : null;
  const speaking = sceneIdx >= 0 && t * 1000 <= timings[sceneIdx].end;

  const progress = useCallback((patch: Record<string, boolean>) => api(`/api/content/${item.id}/progress`, { method: "POST", json: patch }).catch(() => {}), [item.id]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.play().then(
        () => setBlocked(false),
        () => setBlocked(true),
      );
    } else {
      v.pause();
    }
  }, [active]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = slow ? 0.7 : 1;
  }, [slow]);

  function toggle() {
    const v = ref.current!;
    if (v.paused) v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    else v.pause();
  }

  function replayLine() {
    const v = ref.current!;
    const idx = Math.max(0, sceneIdx);
    v.currentTime = (timings[idx]?.start ?? 0) / 1000;
    v.play();
  }

  function onTime() {
    const v = ref.current!;
    setT(v.currentTime);
    if (!completed.current && v.duration && v.currentTime / v.duration > 0.85) {
      completed.current = true;
      progress({ completed: true });
    }
  }

  return (
    <div className="relative h-full w-full max-w-[min(100vw,calc(100dvh*9/16))] overflow-hidden md:h-[94dvh] md:rounded-3xl">
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload={active ? "auto" : "metadata"}
        onClick={toggle}
        onTimeUpdate={onTime}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setEnded(true)}
        className="h-full w-full cursor-pointer object-cover"
        aria-label={`Video: ${item.title}`}
      >
        <track kind="captions" srcLang="es" label="Español" src={item.media.find((m) => m.kind === "subtitles")?.public_url ?? undefined} />
      </video>

      {(blocked || (!playing && !ended)) && (
        <button onClick={toggle} className="absolute inset-0 grid place-items-center bg-black/20" aria-label="Play">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-white/90 text-3xl text-black shadow-xl">▶</span>
        </button>
      )}

      {/* Top info */}
      <div className="pointer-events-none absolute inset-x-0 top-[4.25rem] px-4">
        {item.recommendation.reasons[0] && <p className="inline-block rounded-full bg-black/40 px-3 py-1 text-xs font-medium backdrop-blur">🎯 {item.recommendation.reasons[0]}</p>}
      </div>

      {/* Captions */}
      <div className="absolute inset-x-0 bottom-36 px-4 md:bottom-28" onClick={(e) => e.stopPropagation()}>
        {scene && (
          <div key={sceneIdx} data-testid="caption" className="animate-rise mx-auto max-w-md rounded-2xl bg-black/55 px-4 py-3 text-center backdrop-blur">
            <WordTapText
              text={scene.text}
              className={`block font-display text-2xl font-bold leading-snug transition ${speaking ? "text-white" : "text-white/85"}`}
              onLookup={() => ref.current?.pause()}
            />
            {showEn && <p className="mt-1 text-sm text-white/75">{scene.translation}</p>}
          </div>
        )}
      </div>

      {/* Side actions */}
      <div className="absolute bottom-40 right-2 flex flex-col items-center gap-3 md:bottom-32">
        <Action label={liked ? "Unlike" : "Like"} icon={liked ? "❤️" : "🤍"} onClick={() => { setLiked(!liked); progress({ liked: !liked }); }} />
        <Action label={bookmarked ? "Remove bookmark" : "Bookmark"} icon={bookmarked ? "🔖" : "📑"} onClick={() => { setBookmarked(!bookmarked); progress({ bookmarked: !bookmarked }); }} />
        <Action label="Repeat sentence" icon="🔁" onClick={replayLine} />
        <Action label={slow ? "Normal speed" : "Slow down"} icon={slow ? "🐢" : "🐇"} active={slow} onClick={() => setSlow(!slow)} />
        <Action label={showEn ? "Hide translation" : "Show translation"} icon="🌐" active={showEn} onClick={() => setShowEn(!showEn)} />
        <Action label="Skip" icon="⏭️" onClick={() => { progress({ skipped: true }); onNext(); }} />
      </div>

      {/* Bottom meta */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-20 pt-10 md:pb-5">
        <p className="font-display text-lg font-bold">{item.title}</p>
        <p className="text-sm text-white/70">
          {item.genre} · {item.cefr}
          {item.source !== "starter" && " · made for you"}
        </p>
      </div>

      {ended && !quiz && (
        <div className="animate-pop absolute inset-x-4 bottom-28 rounded-3xl bg-white p-5 text-black shadow-2xl md:bottom-10">
          <p className="font-display text-lg font-bold">Nice! Quick check?</p>
          <p className="text-sm text-neutral-600">{item.body.questions.length} questions about what happened.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setQuiz(true)} className="min-h-11 flex-1 rounded-xl bg-[#ff4d6d] font-semibold text-white">
              Answer
            </button>
            <button onClick={replayLine} className="min-h-11 rounded-xl bg-neutral-100 px-4 font-semibold">
              Replay
            </button>
            <button onClick={onNext} className="min-h-11 rounded-xl bg-neutral-100 px-4 font-semibold">
              Next
            </button>
          </div>
        </div>
      )}
      {quiz && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-black/70 p-4 backdrop-blur" onClick={(e) => e.stopPropagation()}>
          <div className="animate-pop mx-auto mt-16 max-w-md rounded-3xl bg-surface p-5 text-text">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg font-bold">¿Qué pasó?</p>
              <button onClick={() => setQuiz(false)} aria-label="Close quiz" className="text-muted">
                ✕
              </button>
            </div>
            <Quiz contentId={item.id} questions={item.body.questions} />
            <button onClick={() => { setQuiz(false); onNext(); }} className="mt-3 min-h-11 w-full rounded-xl bg-surface-2 font-semibold">
              Next video ↓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Action({ icon, label, onClick, active }: { icon: string; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`grid h-12 w-12 place-items-center rounded-full text-2xl backdrop-blur transition active:scale-90 ${active ? "bg-white/40" : "bg-black/35"}`}
    >
      <span className="emoji" aria-hidden>
        {icon}
      </span>
    </button>
  );
}
