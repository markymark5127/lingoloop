import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { aiMode } from "@/lib/ai";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await supabaseServer();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");
  const { data: prefs } = await db.from("learning_profiles").select("level, onboarded").eq("user_id", uid).single();
  if (!prefs?.onboarded) redirect("/onboarding");
  return (
    <AppShell level={prefs.level} aiMode={aiMode()}>
      {children}
    </AppShell>
  );
}
