/** Japanese-speaking learners and the installable PWA. */
import { test, expect, type Page } from "@playwright/test";

const JP = /[ぁ-んァ-ン一-龯]/;

test.describe("Japanese learner", () => {
  test.use({ locale: "ja-JP" });

  async function signUpJa(page: Page) {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "無料ではじめる" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await page.getByRole("link", { name: "無料ではじめる" }).click();
    await page.getByLabel("名前").fill("さくら");
    await page.getByLabel("メールアドレス").fill(`sakura+${Date.now()}@example.com`);
    await page.getByLabel("パスワード").fill("sakura-learns-42");
    await page.getByRole("button", { name: "登録する" }).click();
    await page.waitForURL("**/onboarding");
    await expect(page.getByRole("button", { name: /日本語/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByRole("button", { name: /はじめたばかり/ }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByRole("button", { name: /ミステリー/ }).click();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByRole("button", { name: /^10/ }).click();
    await page.getByRole("button", { name: "学習をはじめる" }).click();
    await page.waitForURL("**/home");
  }

  test("signs up, learns and gets feedback entirely in Japanese", async ({ page }) => {
    await signUpJa(page);
    await expect(page.getByRole("heading", { name: /次の冒険が/ })).toBeVisible();
    expect((await (await page.request.get("/api/me")).json()).prefs.native_language).toBe("ja");

    // Story: Spanish text, Japanese translation & questions.
    await page.goto("/stories");
    await expect(page.getByRole("heading", { name: "ストーリー" })).toBeVisible();
    await page.getByRole("link", { name: /El misterio del café/ }).first().click();
    await expect(page.getByRole("heading", { name: "El misterio del café" })).toBeVisible();
    await page.getByRole("button", { name: "日本語訳を表示" }).click();
    await expect(page.getByText("クララはマドリードで小さなカフェをやっています。", { exact: false })).toBeVisible();
    await expect(page.getByText("クララのカフェはどこにありますか？")).toBeVisible();

    // Tap a word: Japanese gloss.
    await page.getByRole("button", { name: "café", exact: true }).first().click();
    await expect(page.getByRole("dialog").getByText("コーヒー")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // Games are full immersion: Spanish instruction, no translation in any language.
    const g = await (await page.request.post("/api/games", { data: { type: "picture_choice" } })).json();
    expect(g.payload.instruction).toMatch(/^Toca/);
    expect(JSON.stringify(g.payload)).not.toMatch(JP);

    // Conversation: Japanese scenario, translation and feedback.
    await page.goto("/talk");
    await page.getByRole("button", { name: /レストランで/ }).click();
    await page.waitForURL(/\/talk\/.+/);
    await page.getByLabel("メッセージ").fill("yo es estudiante y quiero una pizza");
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByTestId("ai-message").nth(1)).toBeVisible();
    await page.getByRole("button", { name: /翻訳/ }).last().click();
    await expect(page.getByTestId("ai-message").last()).toContainText(JP);
    await page.getByRole("button", { name: "終了してフィードバックを見る" }).click();
    await expect(page.getByText("直すとよい点")).toBeVisible();
    await expect(page.getByText(/ser は soy/)).toBeVisible();

    // Progress page.
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "進捗" })).toBeVisible();
  });

  test("switching the language in settings changes the whole app", async ({ page }) => {
    await signUpJa(page);
    await page.goto("/settings");
    await page.getByRole("button", { name: "English" }).click();
    await page.getByRole("button", { name: "設定を保存" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /Your next adventure/ })).toBeVisible();
    const story = (await (await page.request.get("/api/content?kind=story")).json()).items.find((s: { title: string }) => s.title === "El misterio del café");
    expect(story.summary).toBe("Every morning someone leaves a mysterious letter at Clara's café.");
  });
});

test("landing page language switcher", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start learning — free" })).toBeVisible();
  await page.getByRole("button", { name: "日本語" }).click();
  await expect(page.getByRole("link", { name: "無料ではじめる" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("link", { name: "Start learning — free" })).toBeVisible();
});

test.describe("PWA", () => {
  test("serves a valid manifest, icons and service worker", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m).toMatchObject({ short_name: "LingoLoop", display: "standalone", start_url: expect.stringContaining("/home") });
    for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect(await sw.text()).toContain("addEventListener(\"fetch\"");
  });

  test("installs the service worker and works offline", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    await page.reload(); // page is now controlled and cached
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("link", { name: "Start learning — free" })).toBeVisible(); // cached page
    await page.goto("/forgot-password"); // never visited: offline fallback page
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await context.setOffline(false);
  });
});
