"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { ErrorBox, Spinner } from "@/components/ui";
import { useLocale, useT } from "@/lib/i18n/client";

interface Scenario {
  id: string;
  title: string;
  emoji: string;
  character: string;
  goal: string;
}
interface Session {
  id: string;
  scenario: string;
  character_name: string;
  status: string;
  created_at: string;
}

export default function TalkPage() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState<{ scenarios: Scenario[]; sessions: Session[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    api<{ scenarios: Scenario[]; sessions: Session[] }>("/api/conversations").then(setData, (e) => setError(e.message));
  }, []);

  async function start(id: string) {
    setStarting(id);
    try {
      const { id: sid } = await api<{ id: string }>("/api/conversations", { method: "POST", json: { scenario: id } });
      router.push(`/talk/${sid}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header>
        <h1 className="font-display text-4xl font-extrabold">{t("Speak")}</h1>
        <p className="text-muted">{t("Roleplay real situations by voice or text. Focus on communicating — feedback comes at the end.")}</p>
      </header>
      {error && <ErrorBox message={error} />}
      {!data && !error && <Spinner label={t("Loading scenarios…")} />}
      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.scenarios.map((s) => (
            <button key={s.id} onClick={() => start(s.id)} disabled={!!starting} className="group flex items-start gap-3 glass rounded-[28px] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60">
              <span className="emoji grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-3xl">{s.emoji}</span>
              <span>
                <span className="block font-display text-lg font-bold group-hover:text-accent">{s.title}</span>
                <span className="block text-sm text-muted">{t("with {name}", { name: s.character })}</span>
                <span className="mt-1 block text-xs text-muted">🎯 {s.goal}</span>
                {starting === s.id && <Spinner small label={t("Starting…")} />}
              </span>
            </button>
          ))}
        </div>
      )}
      {data && data.sessions.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">{t("Recent conversations")}</h2>
          <ul className="divide-y divide-border glass rounded-[28px]">
            {data.sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/talk/${s.id}`} className="flex min-h-12 items-center justify-between px-4 py-2 hover:bg-surface-2">
                  <span>
                    {data.scenarios.find((x) => x.id === s.scenario)?.emoji} {data.scenarios.find((x) => x.id === s.scenario)?.title} · {s.character_name}
                  </span>
                  <span className="text-xs text-muted">{s.status === "ended" ? t("Feedback ready") : t("Continue")} · {new Date(s.created_at).toLocaleDateString(locale === "ja" ? "ja-JP" : undefined)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
