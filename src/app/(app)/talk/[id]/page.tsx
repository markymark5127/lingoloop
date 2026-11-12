"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { browserRecognitionAvailable, createRecognizer, recordAndTranscribe, speak, stopSpeaking } from "@/lib/client/speech";
import { useActivityTimer } from "@/lib/client/useActivityTimer";
import { ReadingText, WordTapText } from "@/components/WordTapText";
import { displayText } from "@/lib/lang";
import { useTarget } from "@/lib/lang/client";

const PLACEHOLDER = { es: "Escribe en español…", ja: "日本語で書いてください…" } as const;
import { Button, ErrorBox, Spinner } from "@/components/ui";
import type { ConversationSummary } from "@/lib/content/schemas";
import { useT } from "@/lib/i18n/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reading?: string | null;
  translation?: string | null;
  via_voice?: boolean;
}
interface Data {
  session: { id: string; status: string; level: string; summary: ConversationSummary | null };
  scenario: { title: string; emoji: string; character: string; goal: string };
  messages: Message[];
  aiMode: "openai" | "offline";
}

export default function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const t = useT();
  const lang = useTarget();
  const { id } = use(params);
  useActivityTimer("talk");
  const [data, setData] = useState<Data | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceOut, setVoiceOut] = useState(true);
  const [listening, setListening] = useState(false);
  const [shownEn, setShownEn] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [ending, setEnding] = useState(false);
  const usedVoice = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const recognizer = useRef<ReturnType<typeof createRecognizer>>(null);
  const abortRec = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>(`/api/conversations/${id}`);
      setData(d);
      setMessages(d.messages);
      setSummary(d.session.summary);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data on mount / when filters change
    load();
    return () => stopSpeaking();
  }, [load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, summary]);

  async function send(text = input) {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    const temp: Message = { id: `tmp-${Date.now()}`, role: "user", content, via_voice: usedVoice.current };
    setMessages((m) => [...m, temp]);
    try {
      const r = await api<{ userMessage: Message; reply: Message }>(`/api/conversations/${id}/messages`, { method: "POST", json: { content, viaVoice: usedVoice.current } });
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), r.userMessage, r.reply]);
      if (voiceOut) speak(r.reply.content);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(content);
      setError((e as Error).message);
    } finally {
      usedVoice.current = false;
      setSending(false);
    }
  }

  async function mic() {
    if (listening) {
      recognizer.current?.stop();
      abortRec.current?.abort();
      return;
    }
    stopSpeaking();
    setError(null);
    usedVoice.current = true;
    if (data?.aiMode === "openai" || !browserRecognitionAvailable()) {
      if (data?.aiMode !== "openai" && !browserRecognitionAvailable()) {
        setError(t("Voice input needs Chrome/Edge/Safari speech recognition, or OPENAI_API_KEY on the server."));
        return;
      }
      setListening(true);
      abortRec.current = new AbortController();
      try {
        const text = await recordAndTranscribe(12000, abortRec.current.signal);
        setListening(false);
        if (text) send(text);
      } catch (e) {
        setListening(false);
        setError((e as Error).message);
      }
      return;
    }
    const r = createRecognizer(
      (text, final) => {
        setInput(text);
        if (final) send(text);
      },
      (err) => {
        setListening(false);
        if (err && err !== "no-speech" && err !== "aborted") setError(`Microphone: ${err}`);
      },
    );
    recognizer.current = r;
    setListening(true);
    r?.start();
  }

  async function end() {
    setEnding(true);
    try {
      const { summary } = await api<{ summary: ConversationSummary }>(`/api/conversations/${id}/end`, { method: "POST" });
      setSummary(summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnding(false);
    }
  }

  if (!data) return <div className="grid h-64 place-items-center">{error ? <ErrorBox message={error} /> : <Spinner label={t("Joining conversation…")} />}</div>;
  const ended = !!summary || data.session.status === "ended";

  return (
    <div className="mx-auto flex h-[calc(100dvh-11.5rem)] max-w-2xl flex-col md:h-dvh">
      <header className="glass mx-3 mt-3 flex items-center gap-3 rounded-[24px] px-3 py-2.5 md:mt-4">
        <Link href="/talk" aria-label={t("Back")} className="rounded-lg px-2 py-1 text-muted hover:text-text">←</Link>
        <span className="emoji grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-2xl">{data.scenario.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{data.scenario.character}</p>
          <p className="truncate text-xs text-muted">{data.scenario.title} · 🎯 {data.scenario.goal}</p>
        </div>
        <button onClick={() => setVoiceOut(!voiceOut)} aria-pressed={voiceOut} aria-label={voiceOut ? t("Mute spoken replies") : t("Speak replies")} className="grid h-10 w-10 place-items-center rounded-full bg-surface-2">
          <span className="emoji">{voiceOut ? "🔊" : "🔇"}</span>
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div data-testid={m.role === "user" ? "user-message" : "ai-message"} className={`animate-rise max-w-[85%] rounded-3xl px-4 py-2.5 ${m.role === "user" ? "rounded-br-md bg-accent-gradient text-white shadow-md shadow-accent/20" : "rounded-bl-md glass-strong"}`}>
              {m.role === "assistant" ? <WordTapText text={m.content} reading={m.reading} className="text-[1.05rem] leading-loose" /> : <p className="text-[1.05rem]">{m.content}</p>}
              {m.role === "assistant" && (
                <div className="mt-1 flex gap-3 text-xs text-muted">
                  <button onClick={() => speak(m.content)} className="hover:text-text">🔊 {t("Play audio")}</button>
                  {m.translation && <button onClick={() => setShownEn((s) => ({ ...s, [m.id]: !s[m.id] }))} className="hover:text-text">🌐 {shownEn[m.id] ? t("Hide") : t("Translate")}</button>}
                </div>
              )}
              {m.role === "assistant" && shownEn[m.id] && <p className="mt-1 text-sm text-muted">{m.translation}</p>}
              {m.role === "user" && m.via_voice && <p className="mt-0.5 text-right text-[10px] opacity-75">🎙 {t("spoken")}</p>}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="glass-strong rounded-3xl rounded-bl-md px-4 py-3 text-muted">
              <span className="animate-pulse">{data.scenario.character} is typing…</span>
            </div>
          </div>
        )}
        {summary && <SummaryCard s={summary} />}
        <div ref={bottom} />
      </div>

      {error && <div className="px-4 pb-2"><ErrorBox message={error} /></div>}

      {!ended ? (
        <div className="px-3 pb-3">
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="glass flex items-center gap-2 rounded-full p-1.5">
            <button type="button" onClick={mic} aria-label={listening ? t("Stop recording") : t("Speak into the microphone")} aria-pressed={listening} className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-xl transition ${listening ? "animate-pulse bg-danger text-white" : "bg-surface-2"}`}>
              <span className="emoji">🎙️</span>
            </button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? (lang === "ja" ? t("Listening… speak Japanese") : t("Listening… speak Spanish")) : PLACEHOLDER[lang]} aria-label={t("Message")} className="min-h-12 flex-1 rounded-full border border-border bg-surface-solid/60 px-4 outline-none focus:border-accent-2" />
            <Button type="submit" disabled={!input.trim()} loading={sending} className="!rounded-full">{t("Send")}</Button>
          </form>
          <div className="mt-2 flex justify-between px-3 text-xs text-muted">
            <span>{t("Tap any word in a reply for its meaning")}</span>
            <button onClick={end} disabled={ending || messages.filter((m) => m.role === "user").length === 0} className="font-semibold text-accent disabled:opacity-40">
              {ending ? t("Summarizing…") : t("End & get feedback")}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <Link href="/talk" className="flex min-h-11 items-center justify-center rounded-full bg-accent-gradient font-semibold text-white shadow-lg shadow-accent/30">{t("Start another conversation")}</Link>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ s }: { s: ConversationSummary }) {
  const t = useT();
  return (
    <div className="animate-pop space-y-4 glass rounded-[32px] p-5">
      <p className="font-display text-xl font-extrabold">{t("Conversation feedback")}</p>
      <p className="text-sm">{s.overview}</p>
      {s.strengths.length > 0 && (
        <div>
          <p className="text-sm font-bold text-success">{t("What went well")}</p>
          <ul className="list-disc pl-5 text-sm">{s.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {s.corrections.length > 0 && (
        <div>
          <p className="text-sm font-bold text-danger">{t("Worth fixing")}</p>
          <ul className="space-y-2 text-sm">
            {s.corrections.map((c, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3">
                <span className="line-through opacity-70">{displayText(c.original)}</span> → <b>{displayText(c.corrected)}</b>
                <p className="text-xs text-muted">{c.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.usefulPhrases.length > 0 && (
        <div>
          <p className="text-sm font-bold">{t("Useful phrases")}</p>
          <ul className="space-y-1 text-sm">
            {s.usefulPhrases.map((p, i) => (
              <li key={i}>
                <button onClick={() => speak(p.es)} className="text-left hover:text-accent">
                  🔊 <ReadingText text={p.es} reading={p.reading} className="font-bold leading-loose" />
                </button>{" "}
                — {p.en}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="rounded-xl bg-accent-soft p-3 text-sm"><b>{t("Next:")}</b> {s.nextStep}</p>
    </div>
  );
}
