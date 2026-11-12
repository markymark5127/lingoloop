"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Card, Chip, ErrorBox, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Me {
  email: string;
  displayName: string;
  aiMode: "openai" | "offline";
  prefs: { level: string; interests: string[]; daily_goal_minutes: number };
}
const INTERESTS = ["comedy", "mystery", "sci-fi", "travel", "everyday", "romance", "food", "adventure"];

export default function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState(10);
  const [level, setLevel] = useState("A1");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<Me>("/api/me").then((m) => {
      setMe(m);
      setInterests(m.prefs.interests);
      setGoal(m.prefs.daily_goal_minutes);
      setLevel(m.prefs.level);
    }, (e) => setError(e.message));
  }, []);

  async function save() {
    setError(null);
    try {
      await api("/api/onboarding", { method: "POST", json: { level, interests, dailyGoalMinutes: goal } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api("/api/account", { method: "DELETE" });
      await supabaseBrowser().auth.signOut();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  if (!me) return <div className="grid h-64 place-items-center">{error ? <ErrorBox message={error} /> : <Spinner />}</div>;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>
      {error && <ErrorBox message={error} />}
      <Card>
        <p className="font-semibold">{me.displayName}</p>
        <p className="text-sm text-muted">{me.email}</p>
        <p className="mt-2 text-xs text-muted">AI engine: {me.aiMode === "openai" ? "OpenAI (live)" : "Offline content engine"}</p>
      </Card>
      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold">Interests</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip key={i} active={interests.includes(i)} onClick={() => setInterests((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}>{i}</Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Daily goal: {goal} min</p>
          <input type="range" min={5} max={60} step={5} value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Daily goal minutes" />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Level band</p>
          <div className="flex gap-2">{["A1", "A2", "B1", "B2"].map((l) => <Chip key={l} active={level === l} onClick={() => setLevel(l)}>{l}</Chip>)}</div>
          <p className="mt-1 text-xs text-muted">LingoLoop also adjusts this automatically from your results.</p>
        </div>
        <Button onClick={save} disabled={interests.length === 0}>{saved ? "✓ Saved" : "Save preferences"}</Button>
      </Card>
      <Card className="flex items-center justify-between">
        <span className="font-semibold">Theme</span>
        <ThemeToggle />
      </Card>
      <Card>
        <Button variant="secondary" onClick={signOut} className="w-full">Sign out</Button>
      </Card>
      <Card className="space-y-3 border-danger/40">
        <p className="font-semibold text-danger">Delete account</p>
        <p className="text-sm text-muted">Permanently deletes your account, progress, conversations and generated content. Type DELETE to confirm.</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" className="min-h-11 w-full rounded-xl border border-border bg-bg px-3" />
        <Button variant="danger" disabled={confirm !== "DELETE"} loading={deleting} onClick={deleteAccount} className="w-full">Delete my account</Button>
      </Card>
    </div>
  );
}
