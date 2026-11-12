"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, ProgressBar } from "./ui";

interface Job {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  error: string | null;
  content_id: string | null;
}

/** Queue personalized generation and poll the job until the media worker finishes. */
export function GenerateButton({ kind, genre, label, onReady }: { kind: "video" | "story"; genre?: string; label: string; onReady: (contentId: string) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function start() {
    setError(null);
    try {
      const { job } = await api<{ job: Job }>("/api/content/generate", { method: "POST", json: { kind, genre } });
      setJob({ ...job, progress: 0, error: null, content_id: null });
      timer.current = setInterval(async () => {
        try {
          const { job: j } = await api<{ job: Job }>(`/api/generation-jobs/${job.id}`);
          setJob(j);
          if (j.status === "succeeded" || j.status === "failed") {
            clearInterval(timer.current!);
            if (j.status === "succeeded" && j.content_id) onReady(j.content_id);
            if (j.status === "failed") setError(j.error ?? "Generation failed");
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

  if (job) {
    const text = job.status === "queued" ? "Queued — waiting for the media worker…" : job.status === "running" ? (kind === "video" ? "Writing script, narrating & rendering…" : "Writing your story…") : job.status === "succeeded" ? "Ready!" : "Failed";
    return (
      <div className="w-full space-y-2 rounded-xl bg-surface-2 p-3" aria-live="polite">
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
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
