"use client";
import { useState } from "react";
import { alignReading, tokenize } from "@/lib/engine/text";
import { isJapaneseText, kanaToRomaji } from "@/lib/lang";
import { formatReading, useReadingMode, type ReadingMode } from "@/lib/lang/client";
import { api } from "@/lib/client/api";
import { speak } from "@/lib/client/speech";
import { useT } from "@/lib/i18n/client";

interface Lookup {
  found: boolean;
  source?: "dictionary" | "ai";
  vocabId?: string | null;
  lemma?: string;
  reading?: string | null;
  translation?: string;
  partOfSpeech?: string;
  emoji?: string | null;
  example?: string;
}

/**
 * Renders target-language text where every word can be tapped for its meaning and saved.
 * Japanese (stored word-spaced) is shown without the spaces; with a `reading`, each word gets its
 * romaji or kana above it (per the learner's reading-aid setting).
 */
export function WordTapText({ text, reading, className = "", highlight = false, onLookup }: { text: string; reading?: string | null; className?: string; highlight?: boolean; onLookup?: () => void }) {
  const tr = useT();
  const [mode] = useReadingMode();
  const tokens = tokenize(text);
  const ja = isJapaneseText(text);
  const perWord = ja && mode !== "off" ? alignReading(text, tokens, reading) : tokens.map(() => null);
  const aligned = perWord.some(Boolean);
  const line = ja && !aligned ? formatReading(reading, mode) : null;
  const [open, setOpen] = useState<{ word: string; data?: Lookup; error?: string } | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  async function lookup(word: string) {
    onLookup?.();
    setOpen({ word });
    try {
      const data = await api<Lookup>(`/api/vocabulary/lookup?w=${encodeURIComponent(word)}&s=${encodeURIComponent(text)}`);
      setOpen({ word, data });
    } catch (e) {
      setOpen({ word, error: (e as Error).message });
    }
  }

  async function save(d: Lookup) {
    const key = d.vocabId ?? d.lemma!;
    await api("/api/vocabulary/save", { method: "POST", json: d.vocabId ? { vocabId: d.vocabId } : { lemma: d.lemma, translation: d.translation, partOfSpeech: d.partOfSpeech, ...(d.reading ? { reading: d.reading } : {}) } });
    setSaved((s) => ({ ...s, [key]: true }));
  }

  function renderToken(i: number) {
    const t = tokens[i];
    if (!t.word) return <span key={i}>{t.text}</span>;
    const r = readingFor(perWord[i], t.text, mode);
    return (
      <button
        key={i}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          lookup(t.text);
        }}
        className={`rounded transition hover:bg-accent/20 ${ja ? "px-[1px]" : "px-0.5"} ${highlight ? "underline decoration-accent/60 decoration-2 underline-offset-4" : ""} ${open?.word === t.text ? "bg-accent/25" : ""}`}
      >
        {aligned ? (
          <ruby className="ruby-word">
            {t.text}
            <rt>{r ?? "\u00a0"}</rt>
          </ruby>
        ) : (
          t.text
        )}
      </button>
    );
  }

  return (
    <span className={`relative ${className}`}>
      {groups(tokens, ja).map((g) => (
        <span key={g[0]} className={ja ? "whitespace-nowrap" : undefined}>
          {g.map((i) => renderToken(i))}
        </span>
      ))}
      {line && <span className="mt-1 block text-[0.7em] font-normal leading-snug opacity-70">{line}</span>}

      {open && (
        <span
          role="dialog"
          aria-label={tr("Meaning of {word}", { word: open.word })}
          onClick={(e) => e.stopPropagation()}
          className="animate-pop absolute bottom-full left-1/2 z-40 mb-2 block w-64 -translate-x-1/2 glass rounded-[28px] p-3 text-left text-sm text-text shadow-xl"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="block">
              <span className="block text-lg font-bold">
                {open.data?.emoji && <span className="emoji mr-1">{open.data.emoji}</span>}
                {open.data?.lemma ?? open.word}
              </span>
              {open.data?.reading && open.data.reading !== open.data.lemma && (
                <span className="block text-xs text-muted">
                  {open.data.reading} · {kanaToRomaji(open.data.reading)}
                </span>
              )}
              {open.data?.reading && open.data.reading === open.data.lemma && <span className="block text-xs text-muted">{kanaToRomaji(open.data.reading)}</span>}
              {!open.data && !open.error && <span className="text-muted">{tr("Looking up…")}</span>}
              {open.error && <span className="text-danger">{tr(open.error)}</span>}
              {open.data?.found && (
                <span className="block text-muted">
                  {open.data.translation} <span className="text-xs">· {tr(open.data.partOfSpeech ?? "")}</span>
                </span>
              )}
              {open.data && !open.data.found && <span className="block text-muted">{tr("Not in the dictionary yet.")}</span>}
            </span>
            <button onClick={() => setOpen(null)} aria-label={tr("Close")} className="text-muted hover:text-text">
              ✕
            </button>
          </span>
          {open.data?.found && (
            <span className="mt-2 flex gap-2">
              <button onClick={() => speak(open.data!.lemma!)} className="rounded-full bg-surface-2 px-3 py-1 font-medium">
                🔊 {tr("Hear")}
              </button>
              <button
                onClick={() => save(open.data!)}
                disabled={saved[open.data.vocabId ?? open.data.lemma!]}
                className="rounded-full bg-accent-gradient px-3 py-1 font-medium text-white disabled:opacity-60"
              >
                {saved[open.data.vocabId ?? open.data.lemma!] ? `✓ ${tr("Saved")}` : `＋ ${tr("Save word")}`}
              </button>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** Romaji for every word; kana only where it differs from what's written (e.g. kanji). */
function readingFor(reading: string | null, text: string, mode: ReadingMode): string | null {
  if (!reading || (mode === "kana" && reading === text)) return null;
  return formatReading(reading, mode);
}

/**
 * Group tokens so punctuation never starts or ends a line on its own (Japanese line-break rules):
 * opening brackets stick to the next word, everything else to the previous one.
 */
function groups<T extends { word: boolean; text: string }>(tokens: T[], ja: boolean): number[][] {
  if (!ja) return tokens.map((_, i) => [i]);
  const out: number[][] = [];
  let pending: number[] = [];
  tokens.forEach((t, i) => {
    if (t.word) {
      out.push([...pending, i]);
      pending = [];
    } else if (/^[「『（(〈《【]/.test(t.text.trim()) || out.length === 0) pending.push(i);
    else out[out.length - 1].push(i);
  });
  if (pending.length) out.push(pending);
  return out;
}

/** Non-interactive target-language text with the reading aid (game instructions, labels). */
export function ReadingText({ text, reading, className = "" }: { text: string; reading?: string | null; className?: string }) {
  const [mode] = useReadingMode();
  if (!isJapaneseText(text)) return <span className={className}>{text}</span>;
  const tokens = tokenize(text);
  const perWord = mode !== "off" ? alignReading(text, tokens, reading) : tokens.map(() => null);
  if (!perWord.some(Boolean)) {
    const line = formatReading(reading, mode);
    return (
      <span className={className}>
        {tokens.map((t) => t.text).join("")}
        {line && <span className="mt-0.5 block text-[0.55em] font-medium opacity-70">{line}</span>}
      </span>
    );
  }
  return (
    <span className={className}>
      {groups(tokens, true).map((g) => (
        <span key={g[0]} className="whitespace-nowrap">
          {g.map((i) => {
            const t = tokens[i];
            const r = readingFor(perWord[i], t.text, mode);
            return t.word ? (
              <ruby key={i} className="ruby-word">
                {t.text}
                <rt>{r ?? "\u00a0"}</rt>
              </ruby>
            ) : (
              <span key={i}>{t.text}</span>
            );
          })}
        </span>
      ))}
    </span>
  );
}
