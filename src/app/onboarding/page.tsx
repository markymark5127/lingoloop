import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Onboarding } from "./Onboarding";

export default async function OnboardingPage() {
  const db = await supabaseServer();
  const { data } = await db.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", data.claims.sub).single();
  return <Onboarding defaultName={profile?.display_name ?? ""} />;
}
