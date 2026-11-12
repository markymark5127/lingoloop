"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui";

const LEVELS = [
  { id: "A1", title: "Just starting", text: "I know a few words like hola and gracias." },
  { id: "A2", title: "Beginner", text: "I can handle simple phrases and everyday topics." },
  { id: "B1", title: "Intermediate", text: "I can follow simple stories and conversations." },
];
const INTERESTS = [
  { id: "comedy", label: "Comedy", icon: "😂" },
  { id: "mystery", label: "Mystery", icon: "🕵️" },
  { id: "sci-fi", label: "Sci-fi", icon: "🚀" },
  { id: "travel", label: "Travel", icon: "✈️" },
  { id: "everyday", label: "Everyday life", icon: "☕" },
  { id: "romance", label: "Romance", icon: "💘" },
  { id: "food", label: "Food", icon: "🌮" },
  { id: "adventure", label: "Adventure", icon: "🗺️" },
];
const GOALS = [5, 10, 15, 30];

export function Onboarding({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName);
  const [level, setLevel] = useState("A1");
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setLoading(true);
    setError(null);
    try {
      await api("/api/onboarding", { method: "POST", json: { displayName: name || undefined, nativeLanguage: "en", targetLanguage: "es", level, interests, dailyGoalMinutes: goal } });
      router.replace("/videos");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  const steps = [
    <section key="lang" className="space-y-4">
      <h1 className="font-display text-3xl font-extrabold">¡Hola{name ? `, ${name}` : ""}! 👋</h1>
      <p className="text-muted">Let&apos;s set up your immersion plan. It takes 30 seconds.</p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">What should we call you?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-bg px-3" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-border p-4">
          <p className="text-xs font-medium text-muted">I speak</p>
          <p className="mt-1 font-bold">🇺🇸 English</p>
        </div>
        <div className="rounded-2xl border-2 border-accent bg-accent-soft p-4">
          <p className="text-xs font-medium text-muted">I&apos;m learning</p>
          <p className="mt-1 font-bold">🇪🇸 Spanish</p>
        </div>
      </div>
      <p className="text-xs text-muted">More languages are coming — the data model already supports them.</p>
    </section>,
    <section key="level" className="space-y-3">
      <h1 className="font-display text-2xl font-extrabold">How much Spanish do you know?</h1>
      <p className="text-sm text-muted">Just a starting point — LingoLoop adjusts based on how you actually perform.</p>
      {LEVELS.map((l) => (
        <button key={l.id} onClick={() => setLevel(l.id)} aria-pressed={level === l.id} className={`w-full rounded-2xl border-2 p-4 text-left transition ${level === l.id ? "border-accent bg-accent-soft" : "border-border hover:border-muted"}`}>
          <span className="flex items-center justify-between font-bold">
            {l.title} <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{l.id}</span>
          </span>
          <span className="mt-1 block text-sm text-muted">{l.text}</span>
        </button>
      ))}
    </section>,
    <section key="interests" className="space-y-3">
      <h1 className="font-display text-2xl font-extrabold">What do you enjoy?</h1>
      <p className="text-sm text-muted">We&apos;ll pick and write content around these. Choose at least one.</p>
      <div className="grid grid-cols-2 gap-2">
        {INTERESTS.map((i) => {
          const on = interests.includes(i.id);
          return (
            <button key={i.id} onClick={() => setInterests((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))} aria-pressed={on} className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 font-semibold transition ${on ? "border-accent bg-accent-soft" : "border-border hover:border-muted"}`}>
              <span className="emoji text-2xl">{i.icon}</span> {i.label}
            </button>
          );
        })}
      </div>
    </section>,
    <section key="goal" className="space-y-3">
      <h1 className="font-display text-2xl font-extrabold">Daily goal</h1>
      <p className="text-sm text-muted">Active minutes per day. You can change this any time.</p>
      <div className="grid grid-cols-2 gap-2">
        {GOALS.map((g) => (
          <button key={g} onClick={() => setGoal(g)} aria-pressed={goal === g} className={`rounded-2xl border-2 p-4 text-center transition ${goal === g ? "border-accent bg-accent-soft" : "border-border hover:border-muted"}`}>
            <span className="block font-display text-3xl font-extrabold">{g}</span>
            <span className="text-sm text-muted">min / day</span>
          </button>
        ))}
      </div>
    </section>,
  ];

  const canNext = step !== 2 || interests.length > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <div className="mb-8 flex gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </div>
      <div className="animate-rise flex-1" key={step}>
        {steps[step]}
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <div className="flex gap-3 pt-6">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button className="flex-1" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button className="flex-1" loading={loading} onClick={finish}>
            Start learning
          </Button>
        )}
      </div>
    </main>
  );
}
