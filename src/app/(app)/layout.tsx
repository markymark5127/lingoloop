import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { aiMode } from "@/lib/ai";
import { LocaleProvider } from "@/lib/i18n/client";
import { toLocale } from "@/lib/i18n/core";
import { toTarget } from "@/lib/lang";
import { TargetProvider } from "@/lib/lang/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await supabaseServer();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    db.from("learning_profiles").select("level, onboarded, native_language, target_language").eq("user_id", uid).single(),
    db.from("profiles").select("display_name").eq("id", uid).single(),
  ]);
  if (!prefs?.onboarded) redirect("/onboarding");
  // The learner's native language (from their profile) is the source of truth inside the app.
  const locale = toLocale(prefs.native_language);
  const target = toTarget(prefs.target_language);
  return (
    <LocaleProvider locale={locale}>
      <TargetProvider lang={target} level={prefs.level}>
        <AppShell level={prefs.level} name={profile?.display_name ?? ""} aiMode={aiMode()} locale={locale} target={target}>
          {children}
        </AppShell>
      </TargetProvider>
    </LocaleProvider>
  );
}
