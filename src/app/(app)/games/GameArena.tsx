"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { speak } from "@/lib/client/speech";
import { useActivityTimer } from "@/lib/client/useActivityTimer";
import type { GamePayload, GameType } from "@/lib/engine/games";
import { Button, Chip, ErrorBox, Spinner } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { ReadingText } from "@/components/WordTapText";
import { displayText } from "@/lib/lang";
import { formatReading, useReadingMode, useTarget } from "@/lib/lang/client";

// Feedback stays in the target language too (immersion).
const CORRECT = { es: "¡Correcto! 🎉", ja: "正解！ 🎉" } as const;
const ALMOST = { es: "¡Casi! 🤔", ja: "おしい！ 🤔" } as const;

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
  focus: { lemma: string; reading: string | null; emoji: string | null } | null;
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
  pitch_accent: "Pitch accent",
};
const LABEL_COLOR: Record<string, string> = { strong: "text-success", developing: "text-warning", "needs-practice": "text-danger" };

export function GameArena() {
  useActivityTimer("game");
  const t = useT();
  const lang = useTarget();
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
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold">{t("Play")}</h1>
          <p className="text-sm text-muted">{t("Adapts to what you know — and what you keep missing.")}</p>
        </div>
        <div className="text-right" aria-live="polite">
          <p className="font-display text-2xl font-extrabold">
            {score.right}/{score.total}
          </p>
          {score.streak >= 2 && <p className="text-xs font-semibold text-accent">🔥 {t("{n} streak", { n: score.streak })}</p>}
        </div>
      </header>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Chip active={mode === "adaptive" && !type} onClick={() => { setMode("adaptive"); setType(null); }}>✨ {t("Adaptive")}</Chip>
        <Chip active={mode === "review" && !type} onClick={() => { setMode("review"); setType(null); }}>🔁 {t("Review due")}</Chip>
        {(Object.keys(TYPE_LABEL) as GameType[]).filter((gt) => gt !== "pitch_accent" || lang === "ja").map((gt) => (
          <Chip key={gt} active={type === gt} onClick={() => setType(gt)}>{t(TYPE_LABEL[gt])}</Chip>
        ))}
      </div>

      {error && <ErrorBox message={error} onRetry={next} />}
      {loading && !game && <div className="grid h-64 place-items-center"><Spinner label={t("Building your next challenge…")} /></div>}

      {game && (
        <section key={game.id} className={`animate-rise glass rounded-[32px] p-5 ${feedback && !feedback.correct ? "animate-shake" : ""}`}>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
            <span className="rounded-full bg-surface-2 px-2 py-1">{t(TYPE_LABEL[game.type])}</span>
            <span className="rounded-full bg-surface-2 px-2 py-1">{t("Level {n}", { n: game.difficulty })}</span>
            <span className="rounded-full bg-surface-2 px-2 py-1">{t(game.skill)}</span>
            <span className="text-accent-2">🎯 {game.reason}</span>
          </div>
          <GameView game={game} feedback={feedback} onAnswer={answer} />
        </section>
      )}

      {feedback && (
        <div role="status" className={`animate-pop mt-4 rounded-3xl p-5 ${feedback.correct ? "bg-success-soft" : "bg-danger-soft"}`}>
          <p className={`font-display text-xl font-extrabold ${feedback.correct ? "text-success" : "text-danger"}`}>{feedback.correct ? CORRECT[lang] : ALMOST[lang]}</p>
          {feedback.answerText && !feedback.correct && <p className="mt-1 text-lg">👉 <b>{displayText(feedback.answerText)}</b></p>}
          {feedback.focus && (
            <p className="mt-2 flex items-center gap-2 text-lg">
              {feedback.focus.emoji && <span className="emoji text-3xl">{feedback.focus.emoji}</span>}
              <ReadingText text={feedback.focus.lemma} reading={feedback.focus.reading ?? undefined} className="font-display font-extrabold" />
              <button onClick={() => speak(feedback.focus!.lemma)} aria-label={t("Hear the word")} className="grid h-9 w-9 place-items-center rounded-full bg-surface text-base">
                <span className="emoji">🔊</span>
              </button>
            </p>
          )}
          <ul className="mt-3 space-y-1 text-xs">
            {feedback.mastery.map((m, i) => (
              <li key={i}>
                <b>{m.lemma}</b> · {t(m.skill)}: <span className={`font-semibold ${LABEL_COLOR[m.label]}`}>{t(m.label.replace("-", " "))}</span> ({Math.round(m.value * 100)}%)
              </li>
            ))}
          </ul>
          {feedback.level.change !== "same" && (
            <p className="mt-3 rounded-xl bg-surface p-3 text-sm font-semibold">
              {feedback.level.change === "up" ? `🚀 ${t("Level up!")}` : `🧭 ${t("Adjusting difficulty")}`} {t("Now {level}:", { level: feedback.level.level })} {feedback.level.reason}
            </p>
          )}
          <Button className="mt-4 w-full" onClick={next} loading={loading} autoFocus>
            {t("Next challenge")} →
          </Button>
        </div>
      )}
    </div>
  );
}

function GameView({ game, feedback, onAnswer }: { game: Game; feedback: Feedback | null; onAnswer: (r: unknown, extra?: Record<string, unknown>) => void }) {
  const t = useT();
  const p = game.payload;
  switch (p.type) {
    case "picture_choice":
      return (
        <div>
          <Instruction text={p.instruction} reading={p.instructionReading} />
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
          <Instruction text={p.instruction} reading={p.instructionReading} />
          <SentenceClue emoji={p.emoji} speakText={p.speak} audio={p.audio} />
          <p className="my-6 text-center font-display text-2xl font-bold leading-relaxed">
            {displayText(p.before)}
            <span className="mx-1 inline-block min-w-20 border-b-4 border-accent-2 text-accent-2">{feedback ? (feedback.expected as string) : " "}</span>
            {displayText(p.after)}
            <BlankReading before={p.beforeReading} after={p.afterReading} />
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
    case "pitch_accent":
      return <PitchAccent p={p} feedback={feedback} onAnswer={onAnswer} />;
    case "story_challenge":
      return (
        <div>
          <Instruction text={p.instruction} reading={p.instructionReading} sub={`🎬 ${p.contentTitle}`} />
          <div className={`mt-5 grid gap-3 ${p.options.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {p.options.map((o, i) => (
              <button key={i} disabled={!!feedback} onClick={() => onAnswer({ index: i })} aria-label={t("Option {emoji}", { emoji: o })} className={`grid aspect-square place-items-center rounded-3xl border-2 bg-bg text-5xl transition hover:border-accent-2 ${feedback ? (String(i) === feedback.expected ? "border-success bg-success-soft" : "border-border opacity-50") : "border-border"}`}>
                <span className="emoji">{o}</span>
              </button>
            ))}
          </div>
        </div>
      );
  }
}

/** Romaji/kana for a fill-in-the-blank sentence, with the blank kept blank. */
function BlankReading({ before, after }: { before?: string; after?: string }) {
  const [mode] = useReadingMode();
  if (before === undefined || mode === "off") return null;
  const f = (s?: string) => (s ? formatReading(s, mode) : "") ?? "";
  return <span className="mt-2 block text-sm font-medium text-muted">{`${f(before)} ＿＿ ${f(after)}`.trim()}</span>;
}

/**
 * The meaning of a sentence without translating it: a picture, plus audio that plays by itself
 * (easy), only on tap (medium) or not at all (hard).
 */
function SentenceClue({ emoji, speakText, audio }: { emoji?: string; speakText?: string; audio: "auto" | "tap" | "none" }) {
  const t = useT();
  useEffect(() => {
    if (audio !== "auto" || !speakText) return;
    const h = setTimeout(() => speak(speakText), 400);
    return () => clearTimeout(h);
  }, [audio, speakText]);
  if (!emoji && !speakText) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      {emoji && <span data-testid="picture-clue" className="emoji text-6xl">{emoji}</span>}
      {speakText && audio !== "none" && (
        <div className="flex gap-2">
          <button onClick={() => speak(speakText)} aria-label={t("Play audio")} className="grid h-12 w-12 place-items-center rounded-full bg-accent-2 text-xl text-white">
            <span className="emoji">🔊</span>
          </button>
          <button onClick={() => speak(speakText, { rate: 0.6 })} aria-label={t("Slow")} className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-xl">
            <span className="emoji">🐢</span>
          </button>
        </div>
      )}
    </div>
  );
}

function Instruction({ text, reading, sub }: { text: string; reading?: string; sub?: string }) {
  const t = useT();
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <ReadingText text={text} reading={reading} className="block font-display text-2xl font-extrabold leading-relaxed" />
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      <button onClick={() => speak(text)} aria-label={t("Hear instruction")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl">
        <span className="emoji">🔊</span>
      </button>
    </div>
  );
}

function OptionGrid({ options, feedback, onPick }: { options: { id: string; emoji: string }[]; feedback: Feedback | null; onPick: (id: string) => void }) {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className={`mt-5 grid gap-3 ${options.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
      {options.map((o) => {
        const state = feedback ? (o.id === feedback.expected ? "border-success bg-success-soft scale-105" : o.id === picked ? "border-danger bg-danger-soft" : "border-border opacity-50") : "border-border hover:border-accent-2 hover:-translate-y-0.5";
        return (
          <button key={o.id} disabled={!!feedback} onClick={() => { setPicked(o.id); onPick(o.id); }} aria-label={t("Option {emoji}", { emoji: o.emoji })} className={`grid aspect-square place-items-center rounded-3xl border-2 bg-bg text-6xl transition ${state}`}>
            <span className="emoji">{o.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

function AudioMatch({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "audio_match" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  const t = useT();
  useEffect(() => {
    const t = setTimeout(() => speak(p.speak), 300);
    return () => clearTimeout(t);
  }, [p.speak]);
  return (
    <div>
      <ReadingText text={p.instruction} reading={p.instructionReading} className="block font-display text-2xl font-extrabold leading-relaxed" />
      <div className="my-5 flex justify-center gap-3">
        <Button onClick={() => speak(p.speak)}>🔊 {t("Play audio")}</Button>
        <Button variant="secondary" onClick={() => speak(p.speak, { rate: 0.6 })}>🐢 {t("Slow")}</Button>
      </div>
      <OptionGrid options={p.options} feedback={feedback} onPick={(id) => onAnswer({ optionId: id })} />
    </div>
  );
}

function DragDrop({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "drag_drop" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const drop = (id: string) => {
    setDropped(id);
    onAnswer({ optionId: id });
  };
  return (
    <div>
      <Instruction text={p.instruction} reading={p.instructionReading} />
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
              aria-label={t("Item {emoji}", { emoji: it.emoji })}
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
        aria-label={t("Basket — drop here")}
        className={`mx-auto mt-6 flex h-40 w-full max-w-xs flex-col items-center justify-center rounded-3xl border-4 border-dashed transition ${over || selected ? "border-accent-2 bg-accent-2/10" : "border-border"}`}
      >
        <span className="emoji text-6xl">{p.target.emoji}</span>
        {dropped && <span className="emoji -mt-6 text-4xl">{p.items.find((i) => i.id === dropped)?.emoji}</span>}
        <span className="emoji text-2xl text-muted" aria-hidden>{selected ? "👇" : "✋"}</span>
      </button>
    </div>
  );
}

function SentenceBuilder({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "sentence_builder" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  const t = useT();
  const [mode] = useReadingMode();
  const [chosen, setChosen] = useState<string[]>([]);
  const byId = new Map(p.tokens.map((t) => [t.id, t]));
  const sub = (s?: string) => (s && mode !== "off" ? <span className="block text-[11px] font-medium opacity-75">{formatReading(s, mode)}</span> : null);
  return (
    <div>
      <Instruction text={p.instruction} reading={p.instructionReading} />
      <SentenceClue emoji={p.emoji} speakText={p.speak} audio={p.audio} />
      <div className={`my-5 flex min-h-20 flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed p-3 ${feedback ? (feedback.correct ? "border-success" : "border-danger") : "border-border"}`}>
        {chosen.length === 0 && <span className="emoji text-xl text-muted" aria-hidden>👆</span>}
        {chosen.map((id) => (
          <button key={id} disabled={!!feedback} onClick={() => setChosen((c) => c.filter((x) => x !== id))} className="animate-pop rounded-xl bg-accent-2 px-3 py-2 font-semibold text-white">
            {byId.get(id)?.text}
            {sub(byId.get(id)?.sub)}
          </button>
        ))}
      </div>
      <div data-testid="word-bank" className="flex flex-wrap gap-2">
        {p.tokens.filter((t) => !chosen.includes(t.id)).map((t) => (
          <button key={t.id} disabled={!!feedback} onClick={() => setChosen((c) => [...c, t.id])} className="min-h-11 rounded-xl border-2 border-border bg-bg px-3 py-2 font-semibold hover:border-accent-2">
            {t.text}
            {sub(t.sub)}
          </button>
        ))}
      </div>
      {!feedback && (
        <Button className="mt-5 w-full" disabled={chosen.length < 2} onClick={() => onAnswer({ tokenIds: chosen })}>
          {t("Check")}
        </Button>
      )}
    </div>
  );
}

function MemoryMatch({ game, p, feedback, onAnswer }: { game: Game; p: Extract<GamePayload, { type: "memory_match" }>; feedback: Feedback | null; onAnswer: (r: unknown, extra?: Record<string, unknown>) => void }) {
  const t = useT();
  const [mode] = useReadingMode();
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
        <ReadingText text={p.instruction} reading={p.instructionReading} className="block font-display text-2xl font-extrabold leading-relaxed" />
        <p className="text-sm text-muted" aria-label={t("Misses: {n}", { n: mistakes })}>✗ {mistakes}</p>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {p.cards.map((c) => {
          const show = flipped.includes(c.id) || isMatched(c.id) || !!feedback;
          return (
            <button key={c.id} onClick={() => flip(c.id)} aria-label={show ? c.face : t("Hidden card")} className={`grid aspect-[3/4] place-items-center rounded-2xl border-2 text-center font-bold transition ${isMatched(c.id) ? "border-success bg-success-soft" : show ? "border-accent-2 bg-bg" : "border-transparent bg-gradient-to-br from-accent-2 to-accent text-white hover:scale-[1.03]"}`}>
              {show ? (
                <span className={c.kind === "picture" ? "emoji text-4xl" : "px-1 text-base"}>
                  {c.face}
                  {c.sub && mode !== "off" && <span className="block text-[11px] font-medium opacity-70">{formatReading(c.sub, mode)}</span>}
                </span>
              ) : (
                <span className="text-2xl">?</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A pitch contour: dots high/low over each mora, plus the following particle (hollow). */
function Contour({ morae, pattern, size = "md" }: { morae: string[]; pattern: number[]; size?: "md" | "lg" }) {
  const step = size === "lg" ? 44 : 34;
  const hi = 12;
  const lo = size === "lg" ? 46 : 38;
  const w = step * pattern.length;
  const pts = pattern.map((h, i) => [step / 2 + i * step, h ? hi : lo] as const);
  const labels = [...morae, "が"];
  return (
    <svg viewBox={`0 0 ${w} ${lo + 30}`} width={w} height={lo + 30} role="img" aria-label={pattern.map((h) => (h ? "H" : "L")).join("")} className="mx-auto block">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" className="text-accent-2" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={6} className={i === pts.length - 1 ? "fill-bg stroke-accent-2" : "fill-accent-2"} strokeWidth={3} />
      ))}
      {labels.map((m, i) => (
        <text key={i} x={step / 2 + i * step} y={lo + 24} textAnchor="middle" className={`fill-current text-[15px] font-semibold ${i === labels.length - 1 ? "opacity-50" : ""}`}>
          {m}
        </text>
      ))}
    </svg>
  );
}

function PitchAccent({ p, feedback, onAnswer }: { p: Extract<GamePayload, { type: "pitch_accent" }>; feedback: Feedback | null; onAnswer: (r: unknown) => void }) {
  const t = useT();
  const speakText = p.speak;
  useEffect(() => {
    if (p.audio !== "auto" || !speakText) return;
    const h = setTimeout(() => speak(speakText), 400);
    return () => clearTimeout(h);
  }, [p.audio, speakText]);
  const state = (i: number) => (feedback ? (String(i) === feedback.expected ? "border-success bg-success-soft" : "border-border opacity-50") : "border-border hover:border-accent-2");
  return (
    <div>
      <ReadingText text={p.instruction} reading={p.instructionReading} className="block font-display text-2xl font-extrabold leading-relaxed" />
      <div className="my-5 flex items-center justify-center gap-3">
        {p.mode === "pattern" ? (
          <ReadingText text={p.word} reading={p.reading} className="font-display text-4xl font-extrabold" />
        ) : (
          <div data-testid="pitch-contour" className="rounded-2xl bg-bg px-4 py-2">
            <Contour morae={p.morae} pattern={p.contour} size="lg" />
          </div>
        )}
        {speakText && p.audio !== "none" && (
          <button onClick={() => speak(speakText, { rate: 0.8 })} aria-label={t("Play audio")} className="grid h-12 w-12 place-items-center rounded-full bg-accent-2 text-xl text-white">
            <span className="emoji">🔊</span>
          </button>
        )}
      </div>
      {p.mode === "pattern" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.options.map((pattern, i) => (
            <button key={i} data-testid="pitch-option" disabled={!!feedback} onClick={() => onAnswer({ index: i })} aria-label={t("Option {emoji}", { emoji: pattern.map((h) => (h ? "H" : "L")).join("") })} className={`rounded-2xl border-2 bg-bg p-3 transition ${state(i)}`}>
              <Contour morae={p.morae} pattern={pattern} />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {p.options.map((o, i) => (
            <button key={o.id} disabled={!!feedback} onClick={() => onAnswer({ index: i })} aria-label={t("Option {emoji}", { emoji: o.emoji })} className={`grid aspect-square place-items-center rounded-3xl border-2 bg-bg text-6xl transition ${state(i)}`}>
              <span className="emoji">{o.emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
