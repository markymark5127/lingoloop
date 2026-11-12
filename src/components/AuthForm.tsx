"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "./ui";
import { useLocale, useT } from "@/lib/i18n/client";

export function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input {...props} className="min-h-11 w-full rounded-2xl border border-border bg-surface-solid/60 px-4 py-2 outline-none transition focus:border-accent-2" />
    </label>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = supabaseBrowser();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || undefined, locale }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice(t("Check your email to confirm your account, then log in."));
          return;
        }
        router.replace("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(params.get("next") || "/home");
      }
      router.refresh();
    } catch (err) {
      setError(t((err as Error).message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="font-display text-2xl font-bold">{mode === "login" ? t("Welcome back") : t("Create your account")}</h1>
      {mode === "signup" && <Field label={t("Name")} name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Optional")} />}
      <Field label={t("Email")} name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label={t("Password")} name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{notice}</p>}
      <Button type="submit" loading={loading} className="w-full">
        {mode === "login" ? t("Log in") : t("Sign up")}
      </Button>
      <div className="flex justify-between text-sm text-muted">
        {mode === "login" ? (
          <>
            <Link href="/signup" className="hover:text-text">{t("Create account")}</Link>
            <Link href="/forgot-password" className="hover:text-text">{t("Forgot password?")}</Link>
          </>
        ) : (
          <Link href="/login" className="hover:text-text">{t("Already have an account? Log in")}</Link>
        )}
      </div>
    </form>
  );
}
