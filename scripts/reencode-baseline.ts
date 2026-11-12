/**
 * Re-encode existing videos to H.264 Constrained Baseline so they play in every browser.
 * Some browsers (e.g. Firefox on Linux using OpenH264) can't decode High profile and show a frozen
 * first frame while the audio plays.
 *
 * Each video is uploaded under a NEW path (`video-bl.mp4`) and its media_assets row is repointed, so
 * CDN and service-worker caches of the old URL can't serve the stale file. The original stays in
 * storage untouched. Already-converted videos are skipped, so it's safe to re-run.
 *
 *   npm run reencode:hosted              # convert all
 *   npm run reencode:hosted -- --dry-run # list what would be converted
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

config({ path: ".env.local" });
config();

const run = promisify(execFile);
const dry = process.argv.includes("--dry-run");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function profileOf(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=profile", "-of", "csv=p=0", file]);
  return stdout.trim();
}

async function main() {
  const { data: assets, error } = await db.from("media_assets").select("id, storage_path, public_url").eq("kind", "video");
  if (error) throw error;
  const todo = (assets ?? []).filter((a) => !a.storage_path.endsWith("-bl.mp4"));
  console.log(`[reencode] ${todo.length} of ${assets?.length ?? 0} videos to convert${dry ? " (dry run)" : ""}`);
  if (dry) return todo.forEach((a) => console.log("  ", a.storage_path));

  const dir = await mkdtemp(path.join(os.tmpdir(), "reencode-"));
  let failed = 0;
  try {
    for (const [i, a] of todo.entries()) {
      const src = path.join(dir, "in.mp4");
      const out = path.join(dir, "out.mp4");
      try {
        const res = await fetch(a.public_url!);
        if (!res.ok) throw new Error(`download ${res.status}`);
        await writeFile(src, Buffer.from(await res.arrayBuffer()));
        const before = await profileOf(src);
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out]);
        const after = await profileOf(out);
        if (!/baseline/i.test(after)) throw new Error(`unexpected output profile ${after}`);

        const newPath = a.storage_path.replace(/\.mp4$/, "-bl.mp4");
        const up = await db.storage.from("media").upload(newPath, await readFile(out), { contentType: "video/mp4", upsert: true });
        if (up.error) throw up.error;
        const publicUrl = db.storage.from("media").getPublicUrl(newPath).data.publicUrl;
        const { error: uErr } = await db.from("media_assets").update({ storage_path: newPath, public_url: publicUrl }).eq("id", a.id);
        if (uErr) throw uErr;
        console.log(`[reencode] ${i + 1}/${todo.length} ${a.storage_path} (${before} -> ${after})`);
      } catch (e) {
        failed++;
        console.error(`[reencode] ${i + 1}/${todo.length} FAILED ${a.storage_path}: ${(e as Error).message}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`[reencode] done, ${failed} failure(s)`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(`[reencode] ${(e as Error).message}`);
  process.exit(1);
});
