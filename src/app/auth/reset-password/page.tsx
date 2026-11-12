"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Field } from "@/components/AuthForm";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

export default function ResetPassword() {
  const router = useRouter();
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(t(error.message));
    router.replace("/home");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 glass rounded-[32px] p-6">
        <h1 className="font-display text-2xl font-bold">{t("Choose a new password")}</h1>
        <Field label={t("New password")} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">{t("Update password")}</Button>
      </form>
    </main>
  );
}
