"use client";
import Link from "next/link";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Field } from "@/components/AuthForm";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

export default function ForgotPassword() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password` });
    setLoading(false);
    if (error) setError(t(error.message));
    else setSent(true);
  }

  return sent ? (
    <div className="space-y-3">
      <h1 className="font-display text-2xl font-bold">{t("Check your email")}</h1>
      <p className="text-sm text-muted">{t("If an account exists for {email}, we sent a link to reset your password.", { email })}</p>
      <Link href="/login" className="text-sm font-semibold text-accent">{t("Back to log in")}</Link>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="font-display text-2xl font-bold">{t("Reset password")}</h1>
      <Field label={t("Email")} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">{t("Send reset link")}</Button>
      <Link href="/login" className="block text-center text-sm text-muted hover:text-text">{t("Back to log in")}</Link>
    </form>
  );
}
