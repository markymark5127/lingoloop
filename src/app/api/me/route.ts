import { route, requireUser } from "@/lib/api/http";
import { supabaseServer } from "@/lib/supabase/server";
import { aiMode } from "@/lib/ai";

export const GET = route(async () => {
  const user = await requireUser();
  const db = await supabaseServer();
  const [{ data: profile }, { data: prefs }] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", user.id).single(),
    db.from("learning_profiles").select("*").eq("user_id", user.id).single(),
  ]);
  return { id: user.id, email: user.email, displayName: profile?.display_name, prefs, aiMode: aiMode() };
});
