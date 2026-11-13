"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { useT } from "@/lib/i18n/client";
import { Button, ProgressBar } from "./ui";
import { GENERATION_ENABLED } from "@/lib/features";

interface Job {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  error: string | null;
  content_id: string | null;
}
type GenerateResponse = { reused: true; contentId: string; title: string } | { reused?: false; job: Job; joined?: boolean };

/**
 * "Make me something new". The server first looks in the shared library for a ready item that
 * fits this learner and that they haven't seen yet (no AI cost, instant). Only when nothing fits
 * does it queue a generation job, which we poll until the media worker finishes.
 */
export function GenerateButton({ kind, genre, label, onReady }: { kind: "video" | "story"; genre?: string; label: string; onReady: (contentId: string) => void }) {
  const t = useT();
  const [job, setJob] = useState<Job | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function start() {
    setError(null);
    setFound(null);
    try {
      const r = await api<GenerateResponse>("/api/content/generate", { method: "POST", json: { kind, genre } });
      if (r.reused) {
        setFound(r.title);
        setTimeout(() => onReady(r.contentId), 900);
        return;
      }
      const first = r.job;
      setJob({ ...first, progress: first.progress ?? 0, error: null, content_id: first.content_id ?? null });
      timer.current = setInterval(async () => {
        try {
          const { job: j } = await api<{ job: Job }>(`/api/generation-jobs/${first.id}`);
          setJob(j);
          if (j.status === "succeeded" || j.status === "failed") {
            clearInterval(timer.current!);
            if (j.status === "succeeded" && j.content_id) onReady(j.content_id);
            if (j.status === "failed") setError(j.error ?? t("Generation failed"));
            setTimeout(() => setJob(null), 1500);
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!GENERATION_ENABLED) return null;
  if (found) {
    return (
      <div className="w-full space-y-1 rounded-2xl bg-success-soft p-3 text-sm" aria-live="polite">
        <p className="font-semibold text-success">✓ {t("Found a match in the library")}</p>
        <p className="text-muted">{t('Opening "{title}"…', { title: found })}</p>
      </div>
    );
  }
  if (job) {
    const text =
      job.status === "queued"
        ? t("Queued — waiting for the media worker…")
        : job.status === "running"
          ? kind === "video"
            ? t("Writing script, narrating & rendering…")
            : t("Writing your story…")
          : job.status === "succeeded"
            ? t("Ready!")
            : t("Failed");
    return (
      <div className="w-full space-y-2 rounded-2xl bg-surface-2 p-3" aria-live="polite">
        <p className="text-sm font-medium">{text}</p>
        <ProgressBar value={job.status === "succeeded" ? 100 : Math.max(5, job.progress)} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={start}>
        ✨ {label}
      </Button>
      {error && <p className="text-sm text-danger">{t(error)}</p>}
    </div>
  );
}
