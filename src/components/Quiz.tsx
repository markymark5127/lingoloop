"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "./ui";
import { useT } from "@/lib/i18n/client";

export interface PublicQuestion {
  q: string;
  options: string[];
}

/** Comprehension questions; graded by the server. */
export function Quiz({ contentId, chapter, questions, onDone }: { contentId: string; chapter?: number; questions: PublicQuestion[]; onDone?: (correct: number, total: number) => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<number[]>(questions.map(() => -1));
  const [result, setResult] = useState<{ results: { correct: boolean; answer: number }[]; correct: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const r = await api<typeof result & object>(`/api/content/${contentId}/quiz`, { method: "POST", json: { chapter, answers } });
      setResult(r);
      onDone?.(r.correct, r.total);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <fieldset key={qi} className="space-y-2">
          <legend className="font-semibold">{q.q}</legend>
          <div className="grid gap-2">
            {q.options.map((o, oi) => {
              const r = result?.results[qi];
              const chosen = answers[qi] === oi;
              const state = r ? (oi === r.answer ? "border-success bg-success-soft" : chosen ? "border-danger bg-danger-soft" : "border-border opacity-60") : chosen ? "border-accent-2 bg-accent-2/10" : "border-border";
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={!!result}
                  onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                  className={`min-h-11 rounded-xl border-2 px-3 py-2 text-left text-sm transition ${state}`}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {result ? (
        <p className="animate-rise font-semibold">
          {result.correct === result.total ? `🎉 ${t("Perfect!")}` : t("You got {n} of {total}.", { n: result.correct, total: result.total })}
        </p>
      ) : (
        <Button onClick={submit} loading={loading} disabled={answers.some((a) => a < 0)} className="w-full">
          {t("Check answers")}
        </Button>
      )}
    </div>
  );
}
