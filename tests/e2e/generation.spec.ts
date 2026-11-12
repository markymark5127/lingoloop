/** Async generation pipeline: queue → worker claims job → script + narration + render → stored media. Requires `npm run worker`. */
import { test, expect } from "@playwright/test";

const generated: Record<string, string> = {};

test("personalized video and story generation jobs complete via the media worker", async ({ page }) => {
  test.setTimeout(180_000);
  const email = `gen+${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("generate-me-42");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/onboarding");
  const ob = await page.request.post("/api/onboarding", { data: { level: "A1", interests: ["sci-fi"], dailyGoalMinutes: 10 } });
  expect(ob.ok()).toBe(true);

  for (const kind of ["story", "video"] as const) {
    // fresh: bypass the shared library so this test always exercises real generation.
    const { job } = await (await page.request.post("/api/content/generate", { data: { kind, genre: "sci-fi", fresh: true } })).json();
    expect(job.status).toBe("queued");
    let status = "queued";
    let contentId: string | null = null;
    for (let i = 0; i < 80 && !["succeeded", "failed"].includes(status); i++) {
      await page.waitForTimeout(2000);
      const j = (await (await page.request.get(`/api/generation-jobs/${job.id}`)).json()).job;
      status = j.status;
      contentId = j.content_id;
    }
    expect(status).toBe("succeeded");
    const c = await (await page.request.get(`/api/content/${contentId}`)).json();
    expect(c.created_by).toBeTruthy();
    generated[kind] = contentId!;
    // Generated once, stored with both translations so learners of any language can reuse it.
    expect(c.is_public).toBe(true);
    if (kind === "story") expect(c.body.chapters[0].paragraphs[0].ja).toMatch(/[ぁ-んァ-ン一-龯]/);
    else expect(c.body.scenes[0].translation_ja).toMatch(/[ぁ-んァ-ン一-龯]/);
    if (kind === "video") {
      const video = c.media_assets.find((m: { kind: string }) => m.kind === "video");
      expect(video.duration_ms).toBeGreaterThan(5000);
      const head = await page.request.get(video.public_url);
      expect(head.headers()["content-type"]).toContain("video/mp4");
      // Shows up first in the personal feed.
      await page.goto(`/videos?start=${contentId}`);
      await expect(page.getByText("made for you").first()).toBeVisible();
    } else {
      expect(c.body.chapters.length).toBeGreaterThan(0);
    }
  }
});

test("a second learner asking for the same kind of content reuses the library instead of generating", async ({ browser }) => {
  test.skip(!generated.story || !generated.video, "needs the generation test above");
  const ctx = await browser.newContext({ ...test.info().project.use, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto("/signup");
  await page.getByLabel("メールアドレス").fill(`reuse+${Date.now()}@example.com`);
  await page.getByLabel("パスワード").fill("reuse-me-please-42");
  await page.getByRole("button", { name: "登録する" }).click();
  await page.waitForURL("**/onboarding");
  expect((await page.request.post("/api/onboarding", { data: { level: "A1", interests: ["sci-fi"], dailyGoalMinutes: 10, nativeLanguage: "ja" } })).ok()).toBe(true);

  for (const kind of ["story", "video"] as const) {
    const r = await (await page.request.post("/api/content/generate", { data: { kind, genre: "sci-fi" } })).json();
    expect(r.reused, `${kind} should come from the library`).toBe(true);
    expect(r.job).toBeUndefined();
    // Served in the second learner's language from the same stored item.
    const c = await (await page.request.get(`/api/content/${r.contentId}`)).json();
    expect(c.summary).toMatch(/[ぁ-んァ-ン一-龯]/);
  }
  // An explicit "fresh" request still generates.
  const fresh = await (await page.request.post("/api/content/generate", { data: { kind: "story", genre: "sci-fi", fresh: true } })).json();
  expect(fresh.job?.status).toBe("queued");
  await ctx.close();
});
