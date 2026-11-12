/**
 * An English speaker learning Japanese: onboarding choice, Japanese stories with readings and
 * tap-to-translate, rendered Japanese videos, Japanese games, a Japanese roleplay, generation,
 * and switching between Spanish and Japanese (each keeps its own level).
 * Requires `npm run worker` for the video/generation steps.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const stamp = Date.now();
const user = { email: `kenji+${stamp}@example.com`, password: "sakura-blossom-42", name: "Kenji" };

test.describe.configure({ mode: "serial" });

let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ ...test.info().project.use });
  page = await ctx.newPage();
});
test.afterAll(async () => ctx?.close());

test("English speaker picks Japanese during onboarding", async () => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: /Japanese/ }).click();
  await expect(page.getByRole("heading", { name: /こんにちは/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "How much Japanese do you know?" })).toBeVisible();
  await expect(page.getByText("こんにちは and ありがとう")).toBeVisible();
  await page.getByRole("button", { name: /Just starting/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Mystery/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /^10/ }).click();
  await page.getByRole("button", { name: "Start learning" }).click();
  await page.waitForURL("**/home");
  const me = await (await page.request.get("/api/me")).json();
  expect(me.prefs.target_language).toBe("ja");
  expect(me.prefs.native_language).toBe("en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/おはようございます|こんにちは|こんばんは/);
});

test("Japanese-speaking learners cannot pick Japanese as a target", async () => {
  const r = await page.request.post("/api/onboarding", { data: { nativeLanguage: "ja", targetLanguage: "ja", level: "A1", interests: ["mystery"], dailyGoalMinutes: 10 } });
  expect(r.status()).toBe(400);
});

test("only Japanese content is offered, and stories show readings + tap-to-translate", async () => {
  const stories = await (await page.request.get("/api/content?kind=story")).json();
  const titles = stories.items.map((s: { title: string }) => s.title);
  expect(titles).toEqual(expect.arrayContaining(["カフェのなぞ", "ロボと月"]));
  expect(titles).not.toContain("El misterio del café");

  const story = stories.items.find((s: { title: string }) => s.title === "カフェのなぞ");
  await page.goto(`/stories/${story.id}`);
  await expect(page.getByRole("heading", { name: "カフェのなぞ" })).toBeVisible();
  // Word spaces are hidden; romaji sits above each word.
  const firstPara = page.locator("article .font-serif p").first();
  await expect(firstPara.locator("rt").filter({ hasText: "toukyou" })).toBeVisible();
  // Text without the readings: no word spaces, and every word (kana too) has romaji.
  const base = await firstPara.evaluate((el) => {
    const c = el.cloneNode(true) as HTMLElement;
    c.querySelectorAll("rt").forEach((r) => r.remove());
    return c.textContent;
  });
  expect(base).toContain("ハナは東京で小さなカフェをやっている。");
  await expect(firstPara.locator("rt").filter({ hasText: /^kafe$/ })).toBeVisible();
  // Tap a word: dictionary entry with reading + romaji.
  await page.getByRole("button", { name: /^手紙/ }).first().click();
  const pop = page.getByRole("dialog", { name: /手紙/ });
  await expect(pop).toContainText("letter");
  await expect(pop).toContainText("てがみ · tegami");
});

test("reading aid can switch to kana or off", async () => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Kana/ }).click();
  const stories = await (await page.request.get("/api/content?kind=story")).json();
  await page.goto(`/stories/${stories.items.find((s: { title: string }) => s.title === "カフェのなぞ").id}`);
  await expect(page.locator("article .font-serif p").first().locator("rt").filter({ hasText: "とうきょう" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: /Romaji/ }).click();
});

test("Japanese videos are rendered with Japanese captions", async () => {
  let videos: { title: string; media: { kind: string; public_url: string }[]; body: { scenes: { text: string }[] } }[] = [];
  for (let i = 0; i < 90; i++) {
    videos = (await (await page.request.get("/api/content?kind=video")).json()).items;
    if (videos.some((v) => v.media.some((m) => m.kind === "video"))) break;
    await page.waitForTimeout(2000);
  }
  const v = videos.find((x) => x.media.some((m) => m.kind === "video"))!;
  expect(v).toBeTruthy();
  expect(videos.every((x) => /[ぁ-んァ-ン一-龯]/.test(x.body.scenes[0].text))).toBe(true);
  const vtt = await (await page.request.get(v.media.find((m) => m.kind === "subtitles")!.public_url)).text();
  expect(vtt).toMatch(/[ぁ-んァ-ン一-龯]/);
  expect(vtt).not.toMatch(/[ぁ-んァ-ン一-龯] [ぁ-んァ-ン一-龯]/); // word spaces stripped
  await page.goto("/videos");
  await expect(page.getByTestId("caption").first()).toBeVisible();
  await expect(page.getByTestId("caption").first().locator("rt").first()).toBeAttached();
});

test("games are built from Japanese vocabulary with readings", async () => {
  const pic = await (await page.request.post("/api/games", { data: { type: "picture_choice" } })).json();
  expect(pic.language).toBe("ja");
  expect(pic.payload.instruction).toMatch(/^「 .+ 」 は どれ ？$/);
  expect(pic.payload.instructionReading).toMatch(/^「 [ぁ-んァ-ンー]+ 」 は どれ ？$/);
  const sb = await (await page.request.post("/api/games", { data: { type: "sentence_builder" } })).json();
  expect(sb.payload.tokens.length).toBeGreaterThanOrEqual(3);
  expect(sb.payload.tokens.every((t: { text: string }) => !/\s/.test(t.text))).toBe(true);

  // Full immersion: no English anywhere in a game; meaning comes from pictures and audio.
  for (const g of [pic, sb]) {
    expect(g.payload).not.toHaveProperty("instructionTranslation");
    expect(g.payload).not.toHaveProperty("translation");
  }
  expect(sb.payload.audio).toMatch(/auto|tap|none/);
  await page.goto("/games?type=sentence_builder");
  await expect(page.getByTestId("picture-clue")).toBeVisible();
  await expect(page.locator("section").first()).not.toContainText(/Tap words|Put the|Tap the/);

  // Pitch accent: a contour game built from tagged vocabulary.
  const pa = await (await page.request.post("/api/games", { data: { type: "pitch_accent" } })).json();
  expect(pa.type).toBe("pitch_accent");
  expect(pa.payload.morae.length).toBeGreaterThan(0);
  await page.goto("/games?type=pitch_accent");
  await expect(page.getByTestId("pitch-option").first().or(page.getByTestId("pitch-contour"))).toBeVisible();

  await page.goto("/games?type=memory_match");
  await expect(page.locator("rt").filter({ hasText: /^mitsukete$/ })).toBeVisible();
});

test("Japanese roleplay with readings, offline tutor feedback", async () => {
  await page.goto("/talk");
  await expect(page.getByRole("button", { name: /At a restaurant/ })).toHaveCount(0);
  await page.getByRole("button", { name: /At a ramen shop/ }).click();
  await page.waitForURL(/\/talk\/[0-9a-f-]+$/);
  const first = page.getByTestId("ai-message").first();
  await expect(first).toContainText("いらっしゃいませ");
  await expect(first.locator("rt").filter({ hasText: "gochuumon" })).toBeVisible();
  await page.getByLabel("Message").fill("わたしわ ラーメン を ください");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("ai-message").nth(1)).toContainText("お飲み物");
  await page.getByRole("button", { name: "End & get feedback" }).click();
  await expect(page.getByText("Conversation feedback")).toBeVisible();
  await expect(page.getByText("わたしは", { exact: true })).toBeVisible();
});

test("generated Japanese content joins the Japanese library", async () => {
  const { job } = await (await page.request.post("/api/content/generate", { data: { kind: "story", genre: "mystery", fresh: true } })).json();
  let j = job;
  for (let i = 0; i < 60 && !["succeeded", "failed"].includes(j.status); i++) {
    await page.waitForTimeout(1500);
    j = (await (await page.request.get(`/api/generation-jobs/${job.id}`)).json()).job;
  }
  expect(j.status).toBe("succeeded");
  const c = await (await page.request.get(`/api/content/${j.content_id}`)).json();
  expect(c.language).toBe("ja");
  const p = c.body.chapters[0].paragraphs[0];
  expect(p.es.split(/\s+/).length).toBe(p.reading.split(/\s+/).length);
});

test("switching to Spanish and back keeps a level per language", async () => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /^B1$/ }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();

  await page.getByRole("button", { name: /Spanish/ }).click();
  await expect(page.getByRole("button", { name: /^A1$/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  let me = await (await page.request.get("/api/me")).json();
  expect(me.prefs.target_language).toBe("es");
  const es = await (await page.request.get("/api/content?kind=story")).json();
  expect(es.items.map((s: { title: string }) => s.title)).toContain("El misterio del café");
  const scen = await (await page.request.get("/api/conversations")).json();
  expect(scen.scenarios.map((s: { id: string }) => s.id)).toContain("restaurant");

  await page.reload();
  await page.getByRole("button", { name: /Japanese/ }).click();
  await expect(page.getByRole("button", { name: /^B1$/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  me = await (await page.request.get("/api/me")).json();
  expect(me.prefs.target_language).toBe("ja");
  expect(me.prefs.level).toBe("B1");
  expect(me.prefs.levels).toMatchObject({ ja: "B1", es: "A1" });
});
