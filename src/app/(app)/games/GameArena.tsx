"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { speak } from "@/lib/client/speech";
import { useActivityTimer } from "@/lib/client/useActivityTimer";
import type { GamePayload, GameType } from "@/lib/engine/games";
import { Button, Chip, ErrorBox, Spinner } from "@/components/ui";

interface Game {
  id: string;
  type: GameType;
  difficulty: number;
  payload: GamePayload;
  reason: string;
  skill: string;
}
interface Feedback {
  correct: boolean;
  expected: string | Record<string, string>;
  answerText: string | null;
  focus: { lemma: string; translation: string; emoji: string | null } | null;
  mastery: { lemma?: string; skill: string; value: number; label: string }[];
  level: { level: string; change: "up" | "down" | "same"; reason: string };
}

const TYPE_LABEL: Record<GameType, string> = {
  picture_choice: "Picture pick",
  drag_drop: "Drag & drop",
  audio_match: "Listen & match",
  sentence_builder: "Sentence builder",
  fill_blank: "Fill the blank",
  memory_match: "Memory match",
  story_challenge: "Story challenge",
};
const LABEL_COLOR: Record<string, string> = { strong: "text-success", developing: "text-warning", "needs-practice": "text-danger" };

export function GameArena() {
  useActivityTimer("game");
  const params = useSearchParams();
  const [mode, setMode] = useState<"adaptive" | "review">(params.get("mode") === "review" ? "review" : "adaptive");
  const [type, setType] = useState<GameType | null>((params.get("type") as GameType) || null);
  const [game, setGame] = useState<Game | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0, streak: 0 });
  const started = useRef(0);

  const next = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const g = await api<Game>("/api/games", { method: "POST", json: { mode, type: type ?? undefined } });
      setGame(g);
      started.current = Date.now();
    } catch (e) {
      setGame(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [mode, type]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data on mount / when filters change
    next();
  }, [next]);

  async function answer(response: unknown, extra: Record<string, unknown> = {}) {
    if (!game || feedback) return;
    try {
      const f = await api<Feedback>(`/api/games/${game.id}/answer`, { method: "POST", json: { response, timeMs: Date.now() - started.current, ...extra } });
      setFeedback(f);
      setScore((s) => ({ right: s.right + (f.correct ? 1 : 0), total: s.total + 1, streak: f.correct ? s.streak + 1 : 0 }));
      if (navigator.vibrate) navigator.vibrate(f.correct ? 30 : [40, 40, 40]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Games</h1>
          <p className="text-sm text-muted">Adapts to what you know — and what you keep missing.</p>
        </div>
        <div className="text-right" aria-live="polite">
          <p className="font-display text-2xl font-extrabold">
            {score.right}/{score.total}
          </p>
          {score.streak >= 2 && <p className="text-xs font-semibold text-accent">🔥 {score.streak} streak</p>}
        </div>
      </header>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Chip active={mode === "adaptive" && !type} onClick={() => { setMode("adaptive"); setType(null); }}>✨ Adaptive</Chip>
        <Chip active={mode === "review" && !type} onClick={() => { setMode("review"); setType(null); }}>🔁 Review due</Chip>
        {(Object.keys(TYPE_LABEL) as GameType[]).map((t) => (
          <Chip key={t} active={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t]}</Chip>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={next} />}
      {loading && !game && <div className="grid h-64 place-items-center"><Spinner label="Building your next challenge…" /></div>}

      {game && (
        <section key={game.id} className={`animate-rise rounded-3xl border border-border bg-surface p-5 ${feedback && !feedback.correct ? "animate-shake" : ""}`}>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className="rounded-full bg-surface-2 px-2 py-1">{TYPE_LABEL[game.type]}</span>
            <span className="rounded-full bg-surface-2 px-2 py-1">Level {game.difficulty}</span>
            <span className="rounded-full bg-surface-2 px-2 py-1">{game.skill}</span>
            <span className="text-accent-2">🎯 {game.reason}</span>
          </div>
          <GameView game={game} feedback={feedback} onAnswer={answer} />
        </section>
      )}

      {feedback && (
        <div role="status" className={`animate-pop mt-4 rounded-3xl p-5 ${feedback.correct ? "bg-success-soft" : "bg-danger-soft"}`}>
          <p className={`font-display text-xl font-extrabold ${feedback.correct ? "text-success" : "text-danger"}`}>{feedback.correct ? "¡Correcto! 🎉" : "Not quite"}</p>
          {feedback.answerText && <p className="mt-1 text-sm">{feedback.correct ? "" : "Answer: "}<b>{feedback.answerText}</b></p>}
          {feedback.focus && !feedback.answerText?.includes(feedback.focus.lemma) && (
            <p className="mt-1 text-sm">
              <span className="emoji">{feedback.focus.emoji}</span> <b>{feedback.focus.lemma}</b> — {feedback.focus.translation}
            </p>
          )}
          <ul className="mt-3 space-y-1 text-xs">
            {feedback.mastery.map((m, i) => (
              <li key={i}>
                <b>{m.lemma}</b> · {m.skill}: <span className={`font-semibold ${LABEL_COLOR[m.label]}`}>{m.label.replace("-", " ")}</span> ({Math.round(m.value * 100)}%)
              </li>
            ))}
          </ul>
          {feedback.level.change !== "same" && (
            <p className="mt-3 rounded-xl bg-surface p-3 text-sm font-semibold">
              {feedback.level.change === "up" ? "🚀 Level up!" : "🧭 Adjusting difficulty"} Now {feedback.level.level}: {feedback.level.reason}
            </p>
          )}
          <Button className="mt-4 w-full" onClick={next} loading={loading} autoFocus>
            Next challenge →
          </Button>
        </div>
      )}
    </div>
  );
}

function GameView({ game, feedback, onAnswer }: { game: Game; feedback: Feedback | null; onAnswer: (r: unknown, extra?: Record<string, unknown>) => void }) {
  const p = game.payload;
  switch (p.type) {
    case "picture_choice":
      return (
        <div>
          <Instruction text={p.instruction} sub={p.instructionTranslation} />
          <OptionGrid options={p.options} feedback={feedback} onPick={(id) => onAnswer({ optionId: id })} />
        </div>
      );
    case "audio_match":
      return <AudioMatch p={p} feedback={feedback} onAnswer={onAnswer} />;
    case "drag_drop":
      return <DragDrop p={p} feedback={feedback} onAnswer={onAnswer} />;
    case "sentence_builder":
      return <SentenceBuilder p={p} feedback={feedback} onAnswer={onAnswer} />;
    case "fill_blank":
      return (
        <div>
          <Instruction text={p.instruction} sub={p.translation} />
          <p className="my-6 text-center font-display text-2xl font-bold leading-relaxed">
            {p.before}
            <span className="mx-1 inline-block min-w-20 border-b-4 border-accent-2 text-accent-2">{feedback ? (feedback.expected as string) : " "}</span>
            {p.after}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {p.options.map((o) => (
              <button key={o} disabled={!!feedback} onClick={() => onAnswer({ word: o })} className={`min-h-14 rounded-2xl border-2 text-lg font-semibold transition hover:border-accent-2 ${feedback ? (o === feedback.expected ? "border-success bg-success-soft" : "border-border opacity-50") : "border-border"}`}>
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    case "memory_match":
      return <MemoryMatch game={game} p={p} feedback={feedback} onAnswer={onAnswer} />;
    case "story_challenge":
      return (
        <div>
          <Instruction text={p.instruction} sub={`From "${p.contentTitle}"`} />
          <p className="my-4 text-lg font-semibold">{p.question}</p>
          <div className="grid gap-2">
            {p.options.map((o, i) => (
              <button key={i} disabled={!!feedback} onClick={() => onAnswer({ index: i })} className={`min-h-12 rounded-2xl border-2 px-4 text-left font-medium transition hover:border-accent-2 ${feedback ? (String(i) === feedback.expected ? "border-success bg-success-soft" : "border-border opacity-50") : "border-border"}`}>
                {o}
              </button>
            ))}
          </div>
        </div>
      );
  }
}

function Instruction({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-display text-2xl font-extrabold">{text}</p>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      <button onClick={() => speak(text)} aria-label="Hear instruction" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl">
        <span className="emoji">🔊</span>
      </button>
    </div>
  );
}

function OptionGrid({ options, feedback, onPick }: { options: { id: string; emoji: string }[]; feedback: Feedback | null; onPick: (id: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className={`mt-5 grid gap-3 ${options.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
      {options.map((o) => {
        const state = feedback ? (o.id === feedback.expected ? "border-success bg-success-soft scale-105" : o.id === picked ? "border-danger bg-danger-soft" : "border-border opacity-50") : "border-border hover:border-accent-2 hover:-translate-y-0.5";
        return (
          <button key={o.id} disabled={!!feedback} onClick={() => { setPicked(o.id); onPick(o.id); }} aria-label={`Option ${o.emoji}`} className={`grid aspect-square place-items-center rounded-3xl border-2 bg-bg text-6xl transition ${state}`}>
            <span className="emoji">{o.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

function AudioMatch({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "audio_match" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  useEffect(() => {
    const t = setTimeout(() => speak(p.speak), 300);
    return () => clearTimeout(t);
  }, [p.speak]);
  return (
    <div>
      <p className="font-display text-2xl font-extrabold">{p.instruction}</p>
      <p className="text-sm text-muted">Listen and choose the matching picture</p>
      <div className="my-5 flex justify-center gap-3">
        <Button onClick={() => speak(p.speak)}>🔊 Play</Button>
        <Button variant="secondary" onClick={() => speak(p.speak, { rate: 0.6 })}>🐢 Slow</Button>
      </div>
      <OptionGrid options={p.options} feedback={feedback} onPick={(id) => onAnswer({ optionId: id })} />
    </div>
  );
}

function DragDrop({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "drag_drop" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const drop = (id: string) => {
    setDropped(id);
    onAnswer({ optionId: id });
  };
  return (
    <div>
      <Instruction text={p.instruction} sub={p.instructionTranslation} />
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {p.items.map((it) =>
          dropped === it.id ? null : (
            <button
              key={it.id}
              draggable={!feedback}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
              onClick={() => setSelected(selected === it.id ? null : it.id)}
              disabled={!!feedback}
              aria-pressed={selected === it.id}
              aria-label={`Item ${it.emoji}`}
              className={`grid h-20 w-20 cursor-grab place-items-center rounded-2xl border-2 bg-bg text-5xl transition active:cursor-grabbing ${selected === it.id ? "scale-110 border-accent-2" : "border-border"} ${feedback && it.id === feedback.expected ? "border-success" : ""}`}
            >
              <span className="emoji">{it.emoji}</span>
            </button>
          ),
        )}
      </div>
      <button
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); drop(e.dataTransfer.getData("text/plain")); }}
        onClick={() => selected && !feedback && drop(selected)}
        disabled={!!feedback}
        aria-label="Basket — drop here"
        className={`mx-auto mt-6 flex h-40 w-full max-w-xs flex-col items-center justify-center rounded-3xl border-4 border-dashed transition ${over || selected ? "border-accent-2 bg-accent-2/10" : "border-border"}`}
      >
        <span className="emoji text-6xl">{p.target.emoji}</span>
        {dropped && <span className="emoji -mt-6 text-4xl">{p.items.find((i) => i.id === dropped)?.emoji}</span>}
        <span className="text-sm text-muted">{selected ? "Tap to drop here" : "Drag here (or tap an item, then the basket)"}</span>
      </button>
    </div>
  );
}

function SentenceBuilder({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "sentence_builder" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const byId = new Map(p.tokens.map((t) => [t.id, t.text]));
  return (
    <div>
      <Instruction text={p.instruction} sub={`“${p.translation}”`} />
      <div className={`my-5 flex min-h-20 flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed p-3 ${feedback ? (feedback.correct ? "border-success" : "border-danger") : "border-border"}`}>
        {chosen.length === 0 && <span className="text-sm text-muted">Tap words in order…</span>}
        {chosen.map((id) => (
          <button key={id} disabled={!!feedback} onClick={() => setChosen((c) => c.filter((x) => x !== id))} className="animate-pop rounded-xl bg-accent-2 px-3 py-2 font-semibold text-white">
            {byId.get(id)}
          </button>
        ))}
      </div>
      <div data-testid="word-bank" className="flex flex-wrap gap-2">
        {p.tokens.filter((t) => !chosen.includes(t.id)).map((t) => (
          <button key={t.id} disabled={!!feedback} onClick={() => setChosen((c) => [...c, t.id])} className="min-h-11 rounded-xl border-2 border-border bg-bg px-3 py-2 font-semibold hover:border-accent-2">
            {t.text}
          </button>
        ))}
      </div>
      {!feedback && (
        <Button className="mt-5 w-full" disabled={chosen.length !== p.tokens.length} onClick={() => onAnswer({ tokenIds: chosen })}>
          Check
        </Button>
      )}
    </div>
  );
}

function MemoryMatch({ game, p, feedback, onAnswer }: { game: Game; p: Extract<GamePayload, { type: "memory_match" }>; feedback: Feedback | null; onAnswer: (r: unknown, extra?: Record<string, unknown>) => void }) {
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<[string, string][]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [busy, setBusy] = useState(false);
  const isMatched = (id: string) => matched.some((pair) => pair.includes(id));

  async function flip(id: string) {
    if (busy || feedback || flipped.includes(id) || isMatched(id)) return;
    const f = [...flipped, id];
    setFlipped(f);
    if (f.length === 2) {
      setBusy(true);
      const { match } = await api<{ match: boolean }>(`/api/games/${game.id}/answer`, { method: "POST", json: { checkPair: f } });
      if (match) {
        const m = [...matched, f as [string, string]];
        setMatched(m);
        setFlipped([]);
        setBusy(false);
        if (m.length * 2 === p.cards.length) onAnswer({ pairs: m }, { mistakes });
      } else {
        setMistakes((x) => x + 1);
        setTimeout(() => {
          setFlipped([]);
          setBusy(false);
        }, 800);
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-display text-2xl font-extrabold">{p.instruction}</p>
        <p className="text-sm text-muted">Misses: {mistakes}</p>
      </div>
      <p className="text-sm text-muted">Match each word to its picture</p>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {p.cards.map((c) => {
          const show = flipped.includes(c.id) || isMatched(c.id) || !!feedback;
          return (
            <button key={c.id} onClick={() => flip(c.id)} aria-label={show ? c.face : "Hidden card"} className={`grid aspect-[3/4] place-items-center rounded-2xl border-2 text-center font-bold transition ${isMatched(c.id) ? "border-success bg-success-soft" : show ? "border-accent-2 bg-bg" : "border-transparent bg-gradient-to-br from-accent-2 to-accent text-white hover:scale-[1.03]"}`}>
              {show ? <span className={c.kind === "picture" ? "emoji text-4xl" : "px-1 text-base"}>{c.face}</span> : <span className="text-2xl">?</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
