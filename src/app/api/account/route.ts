import { route, requireUser } from "@/lib/api/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/** Permanently delete the account. All personal data cascades from auth.users. */
export const DELETE = route(async () => {
  const user = await requireUser();
  const admin = supabaseAdmin();
  const { data: gen } = await admin.from("content_items").select("id").eq("created_by", user.id);
  if (gen?.length) {
    const ids = gen.map((g) => g.id);
    const { data: files } = await admin.from("media_assets").select("storage_path").in("content_id", ids);
    if (files?.length) await admin.storage.from("media").remove(files.map((f) => f.storage_path));
    await admin.from("content_items").delete().in("id", ids);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  await (await supabaseServer()).auth.signOut();
  return { ok: true };
});
