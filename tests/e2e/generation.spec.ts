/** Async generation pipeline: queue → worker claims job → script + narration + render → stored media. Requires `npm run worker`. */
import { test, expect } from "@playwright/test";

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
    const { job } = await (await page.request.post("/api/content/generate", { data: { kind, genre: "sci-fi" } })).json();
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
