"use client";
import { useState } from "react";
import { tokenize } from "@/lib/engine/text";
import { api } from "@/lib/client/api";
import { speak } from "@/lib/client/speech";

interface Lookup {
  found: boolean;
  source?: "dictionary" | "ai";
  vocabId?: string | null;
  lemma?: string;
  translation?: string;
  partOfSpeech?: string;
  emoji?: string | null;
  example?: string;
}

/** Renders Spanish text where every word can be tapped for its meaning and saved. */
export function WordTapText({ text, className = "", highlight = false, onLookup }: { text: string; className?: string; highlight?: boolean; onLookup?: () => void }) {
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
    await api("/api/vocabulary/save", { method: "POST", json: d.vocabId ? { vocabId: d.vocabId } : { lemma: d.lemma, translation: d.translation, partOfSpeech: d.partOfSpeech } });
    setSaved((s) => ({ ...s, [key]: true }));
  }

  return (
    <span className={`relative ${className}`}>
      {tokenize(text).map((t, i) =>
        t.word ? (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              lookup(t.text);
            }}
            className={`rounded px-0.5 transition hover:bg-accent/20 ${highlight ? "underline decoration-accent/60 decoration-2 underline-offset-4" : ""} ${open?.word === t.text ? "bg-accent/25" : ""}`}
          >
            {t.text}
          </button>
        ) : (
          <span key={i}>{t.text}</span>
        ),
      )}
      {open && (
        <span
          role="dialog"
          aria-label={`Meaning of ${open.word}`}
          onClick={(e) => e.stopPropagation()}
          className="animate-pop absolute bottom-full left-1/2 z-40 mb-2 block w-64 -translate-x-1/2 rounded-2xl border border-border bg-surface p-3 text-left text-sm text-text shadow-xl"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="block">
              <span className="block text-lg font-bold">
                {open.data?.emoji && <span className="emoji mr-1">{open.data.emoji}</span>}
                {open.data?.lemma ?? open.word}
              </span>
              {!open.data && !open.error && <span className="text-muted">Looking up…</span>}
              {open.error && <span className="text-danger">{open.error}</span>}
              {open.data?.found && (
                <span className="block text-muted">
                  {open.data.translation} <span className="text-xs">· {open.data.partOfSpeech}</span>
                </span>
              )}
              {open.data && !open.data.found && <span className="block text-muted">Not in the dictionary yet.</span>}
            </span>
            <button onClick={() => setOpen(null)} aria-label="Close" className="text-muted hover:text-text">
              ✕
            </button>
          </span>
          {open.data?.found && (
            <span className="mt-2 flex gap-2">
              <button onClick={() => speak(open.data!.lemma!)} className="rounded-lg bg-surface-2 px-2 py-1 font-medium">
                🔊 Hear
              </button>
              <button
                onClick={() => save(open.data!)}
                disabled={saved[open.data.vocabId ?? open.data.lemma!]}
                className="rounded-lg bg-accent px-2 py-1 font-medium text-white disabled:opacity-60"
              >
                {saved[open.data.vocabId ?? open.data.lemma!] ? "✓ Saved" : "＋ Save word"}
              </button>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
