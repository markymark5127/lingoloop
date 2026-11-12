"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Card, Chip, ErrorBox, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { clearPersonalCache } from "@/components/ServiceWorker";
import { useLocale, useT, writeLocaleCookie } from "@/lib/i18n/client";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/core";
import { TARGET_INFO, allowedTargets, toTarget, type TargetLang } from "@/lib/lang";
import { useReadingMode, type ReadingPref } from "@/lib/lang/client";

const READING_MODES: { id: ReadingPref; label: string; example: string }[] = [
  { id: "auto", label: "Auto", example: "" },
  { id: "romaji", label: "Romaji", example: "neko" },
  { id: "kana", label: "Kana", example: "ねこ" },
  { id: "off", label: "Off", example: "猫" },
];

interface Me {
  email: string;
  displayName: string;
  aiMode: "openai" | "offline";
  prefs: { level: string; interests: string[]; daily_goal_minutes: number; native_language?: string; target_language?: string; levels?: Record<string, string> | null };
}
const INTERESTS = ["comedy", "mystery", "sci-fi", "travel", "everyday", "romance", "food", "adventure"];

export default function Settings() {
  const router = useRouter();
  const t = useT();
  const current = useLocale();
  const [native, setNative] = useState<Locale>(current);
  const [me, setMe] = useState<Me | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState(10);
  const [level, setLevel] = useState("A1");
  const [target, setTarget] = useState<TargetLang>("es");
  const [, setReadingMode, readingMode] = useReadingMode();
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
      setTarget(toTarget(m.prefs.target_language));
    }, (e) => setError(e.message));
  }, []);

  async function save() {
    setError(null);
    try {
      await api("/api/onboarding", { method: "POST", json: { level, interests, dailyGoalMinutes: goal, nativeLanguage: native, targetLanguage: target } });
      if (native !== current) writeLocaleCookie(native);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    await clearPersonalCache();
    router.replace("/login");
    router.refresh();
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await api("/api/account", { method: "DELETE" });
      await supabaseBrowser().auth.signOut();
      await clearPersonalCache();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  /** Switching language shows the level previously reached in it. */
  function pickTarget(l: TargetLang) {
    if (!me || l === target) return;
    const saved = me.prefs.levels ?? {};
    const startLevel = toTarget(me.prefs.target_language) === l ? me.prefs.level : saved[l];
    setTarget(l);
    setLevel(startLevel ?? "A1");
  }
  const targets = allowedTargets(native);

  if (!me) return <div className="grid h-64 place-items-center">{error ? <ErrorBox message={error} /> : <Spinner />}</div>;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="font-display text-4xl font-extrabold">{t("Settings")}</h1>
      {error && <ErrorBox message={error} />}
      <Card>
        <p className="font-semibold">{me.displayName}</p>
        <p className="text-sm text-muted">{me.email}</p>
        <p className="mt-2 text-xs text-muted">{t("AI engine:")} {me.aiMode === "openai" ? t("OpenAI (live)") : t("Offline content engine")}</p>
      </Card>
      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold">{t("Your language")}</p>
          <div className="flex gap-2">
            {LOCALES.map((l) => (
              <Chip
                key={l}
                active={native === l}
                onClick={() => {
                  setNative(l);
                  if (!allowedTargets(l).includes(target)) pickTarget("es");
                }}
              >
                <span lang={l}>{LOCALE_LABEL[l]}</span>
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("Used for the interface, translations, hints and feedback.")}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("I'm learning")}</p>
          <div className="flex gap-2">
            {targets.map((l) => (
              <Chip key={l} active={target === l} onClick={() => pickTarget(l)}>
                <span className="emoji">{TARGET_INFO[l].flag}</span> {t(TARGET_INFO[l].name)}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("Each language keeps its own level, words and progress.")}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("Interests")}</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip key={i} active={interests.includes(i)} onClick={() => setInterests((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}>{t(i)}</Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("Daily goal: {n} min", { n: goal })}</p>
          <input type="range" min={5} max={60} step={5} value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label={t("Daily goal minutes")} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("Level band")}</p>
          <div className="flex gap-2">{["A1", "A2", "B1", "B2"].map((l) => <Chip key={l} active={level === l} onClick={() => setLevel(l)}>{l}</Chip>)}</div>
          <p className="mt-1 text-xs text-muted">{t("LingoLoop also adjusts this automatically from your results.")}</p>
        </div>
        <Button onClick={save} disabled={interests.length === 0}>{saved ? `✓ ${t("Saved")}` : t("Save preferences")}</Button>
      </Card>
      {target === "ja" && (
        <Card>
          <p className="mb-2 text-sm font-semibold">{t("Japanese reading aid")}</p>
          <div className="flex flex-wrap gap-2">
            {READING_MODES.map((m) => (
              <Chip key={m.id} active={readingMode === m.id} onClick={() => setReadingMode(m.id)}>
                {t(m.label)} {m.example && <span className="text-xs opacity-70">{m.example}</span>}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t("Shown above each Japanese word in videos, stories, games and chats. Auto fades it as you level up: romaji at A1, kana over kanji at A2–B1, none from B2. Saved on this device.")}</p>
        </Card>
      )}
      <Card className="flex items-center justify-between">
        <span className="font-semibold">{t("Theme")}</span>
        <ThemeToggle />
      </Card>
      <Card>
        <Button variant="secondary" onClick={signOut} className="w-full">{t("Sign out")}</Button>
      </Card>
      <Card className="space-y-3 border-danger/40">
        <p className="font-semibold text-danger">{t("Delete account")}</p>
        <p className="text-sm text-muted">{t("Permanently deletes your account, progress, conversations and generated content. Type DELETE to confirm.")}</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={t("Type DELETE to confirm")} className="min-h-11 w-full rounded-2xl border border-border bg-surface-solid/60 px-4" />
        <Button variant="danger" disabled={confirm !== "DELETE"} loading={deleting} onClick={deleteAccount} className="w-full">{t("Delete my account")}</Button>
      </Card>
    </div>
  );
}
