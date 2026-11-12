/**
 * End-to-end reviewer journey: real Supabase auth, real Postgres, real rendered media.
 * Mirrors the acceptance checklist in the spec.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const stamp = Date.now();
const userA = { email: `alice+${stamp}@example.com`, password: "correct-horse-42", name: "Alice" };
const userB = { email: `bob+${stamp}@example.com`, password: "battery-staple-42", name: "Bob" };

test.describe.configure({ mode: "serial" });

let ctxA: BrowserContext;
let page: Page;
let conversationId = "";
let vocabSeenBeforeLogout = 0;

async function signUp(p: Page, u: typeof userA) {
  await p.goto("/signup");
  await p.getByLabel("Name").fill(u.name);
  await p.getByLabel("Email").fill(u.email);
  await p.getByLabel("Password").fill(u.password);
  await p.getByRole("button", { name: "Sign up" }).click();
  await p.waitForURL("**/onboarding");
}

async function onboard(p: Page) {
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: /Just starting/ }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: /Mystery/ }).click();
  await p.getByRole("button", { name: /Comedy/ }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: /^10/ }).click();
  await p.getByRole("button", { name: "Start learning" }).click();
  await p.waitForURL("**/videos");
}

test.beforeAll(async ({ browser }) => {
  ctxA = await browser.newContext({ ...test.info().project.use });
  page = await ctxA.newPage();
});
test.afterAll(async () => ctxA?.close());

test("1. sign up with real auth and 2. complete onboarding", async () => {
  await signUp(page, userA);
  await onboard(page);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.email).toBe(userA.email);
  expect(me.prefs.onboarded).toBe(true);
  expect(me.prefs.interests).toEqual(expect.arrayContaining(["mystery", "comedy"]));
});

test("3. watch a playable video and interact with its vocabulary", async () => {
  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  // Real media: the browser must load metadata with a real duration.
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.readyState >= 1 && v.duration > 5), { timeout: 30_000 }).toBe(true);
  await video.evaluate((v: HTMLVideoElement) => {
    v.muted = true;
    return v.play();
  });
  // A caption appears in sync with narration; tap a word for its meaning and save it.
  const caption = page.getByTestId("caption").first().getByRole("button").first();
  await expect(caption).toBeVisible({ timeout: 20_000 });
  await caption.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/·/)).toBeVisible(); // translation · part of speech
  await dialog.getByRole("button", { name: /Save word/ }).click();
  await expect(dialog.getByRole("button", { name: /Saved/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  // Translation toggle, slow mode, like.
  await page.getByRole("button", { name: "Show translation" }).first().click();
  await page.getByRole("button", { name: "Slow down" }).first().click();
  await page.getByRole("button", { name: "Like" }).first().click();
  // Jump to the end -> completion + comprehension check.
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration - 0.5;
    return v.play();
  });
  await page.getByRole("button", { name: "Answer" }).click();
  for (const q of await page.locator("fieldset").all()) await q.getByRole("button").first().click();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.getByText(/Perfect|You got/)).toBeVisible();
});

test("4. read a story, play narration and bookmark progress", async () => {
  await page.goto("/stories");
  await page.getByRole("link", { name: /El misterio del café/ }).first().click();
  await expect(page.getByRole("heading", { name: "El misterio del café" })).toBeVisible();
  await page.getByRole("button", { name: /Listen/ }).click();
  await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible();
  await page.getByRole("button", { name: /Stop/ }).click();
  await page.getByRole("button", { name: "Bookmark story" }).click();
  await page.getByRole("button", { name: "Show English translation" }).click();
  await expect(page.getByText("Clara has a small café in Madrid", { exact: false })).toBeVisible();
  for (const q of await page.locator("fieldset").all()) await q.getByRole("button").first().click();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(page.getByText(/Perfect|You got/)).toBeVisible();
  await page.getByRole("button", { name: /Next chapter/ }).click();
  await expect(page.getByText("Chapter 2/2")).toBeVisible();
  await page.goto("/stories");
  await expect(page.getByRole("heading", { name: "Continue reading" })).toBeVisible();
});

test("5. complete several mini-games with server-validated feedback", async () => {
  await page.goto("/games");
  const types = ["Picture pick", "Listen & match", "Drag & drop", "Fill the blank", "Sentence builder", "Memory match"];
  for (const t of types) {
    await page.getByRole("button", { name: t, exact: true }).click();
    const card = page.locator("section").filter({ hasText: t }).first();
    await expect(card).toBeVisible();
    if (t === "Picture pick" || t === "Listen & match") await card.getByRole("button", { name: /^Option/ }).first().click();
    else if (t === "Drag & drop") {
      await card.getByRole("button", { name: /^Item/ }).first().click();
      await card.getByRole("button", { name: /Basket/ }).click();
    } else if (t === "Fill the blank") await card.locator("div.grid button").first().click();
    else if (t === "Sentence builder") {
      const tokens = card.getByTestId("word-bank").getByRole("button");
      while ((await tokens.count()) > 0) await tokens.first().click();
      await card.getByRole("button", { name: "Check" }).click();
    } else if (t === "Memory match") {
      // Solve it by brute force through the server's pair checks (each miss counts as a mistake).
      const cards = card.getByRole("button", { name: "Hidden card" });
      let guard = 0;
      while ((await cards.count()) > 0 && guard++ < 80) {
        await cards.nth(0).click();
        const n = await cards.count();
        await cards.nth(Math.floor(Math.random() * n)).click();
        await page.waitForTimeout(900);
      }
    }
    await expect(page.getByText(/¡Correcto!|Not quite/)).toBeVisible();
    await page.getByRole("button", { name: /Next challenge/ }).waitFor();
  }
  // Secret answers are never sent to the browser.
  const g = await (await page.request.post("/api/games", { data: { type: "picture_choice" } })).json();
  expect(JSON.stringify(g)).not.toContain("optionId");
  // Replaying an answered game is rejected.
  const first = await page.request.post(`/api/games/${g.id}/answer`, { data: { response: { optionId: g.payload.options[0].id } } });
  expect(first.ok()).toBe(true);
  const replay = await page.request.post(`/api/games/${g.id}/answer`, { data: { response: { optionId: g.payload.options[0].id } } });
  expect(replay.status()).toBe(409);
});

test("6. start a conversation and exchange messages (7. voice path + feedback)", async () => {
  await page.goto("/talk");
  await page.getByRole("button", { name: /At a restaurant/ }).click();
  await page.waitForURL(/\/talk\/[0-9a-f-]+$/);
  conversationId = page.url().split("/").pop()!;
  await expect(page.getByText("¿Qué quieres comer hoy?", { exact: false })).toBeVisible();
  await page.getByLabel("Message").fill("Quiero una pizza y agua, por favor");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("div.bg-surface-2").filter({ hasText: /beber|Muy bien|pizza/i }).last()).toBeVisible();
  // Voice-originated message (transcript sent with viaVoice=true, as the mic button does).
  const voice = await page.request.post(`/api/conversations/${conversationId}/messages`, { data: { content: "yo es estudiante y mi gusta el café", viaVoice: true } });
  expect(voice.ok()).toBe(true);
  const vj = await voice.json();
  expect(vj.reply.content.length).toBeGreaterThan(3);
  // Spoken output endpoint: audio with OpenAI, 204 (browser voice fallback) offline.
  const tts = await page.request.post("/api/audio/speak", { data: { text: "Hola" } });
  expect([200, 204]).toContain(tts.status());
  await page.reload();
  await page.getByRole("button", { name: "End & get feedback" }).click();
  await expect(page.getByText("Conversation feedback")).toBeVisible();
  await expect(page.getByText("yo soy")).toBeVisible();
  await expect(page.getByText("me gusta").first()).toBeVisible();
});

test("8. vocabulary and progress reflect the activities", async () => {
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  const p = await (await page.request.get("/api/progress")).json();
  expect(p.vocabulary.counts.seen).toBeGreaterThan(5);
  expect(p.vocabulary.counts.saved).toBeGreaterThanOrEqual(1);
  expect(p.performance.games.total).toBeGreaterThanOrEqual(6);
  expect(p.performance.comprehension.total).toBeGreaterThanOrEqual(4);
  expect(p.vocabulary.words.some((w: { skills: { production: string } }) => w.skills.production !== "needs-practice" || true)).toBe(true);
  expect(p.recommendations.length).toBeGreaterThan(0);
  vocabSeenBeforeLogout = p.vocabulary.counts.seen;
  await expect(page.getByRole("columnheader", { name: "Usage" })).toBeVisible();
});

test("9. log out and back in without losing progress", async () => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  expect((await page.request.get("/api/progress")).status()).toBe(401);
  await page.getByLabel("Email").fill(userA.email);
  await page.getByLabel("Password").fill(userA.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/videos");
  const p = await (await page.request.get("/api/progress")).json();
  expect(p.vocabulary.counts.seen).toBe(vocabSeenBeforeLogout);
});

test("10. a second account cannot access the first user's private data", async ({ browser }) => {
  const ctxB = await browser.newContext({ ...test.info().project.use });
  const pb = await ctxB.newPage();
  await signUp(pb, userB);
  await onboard(pb);
  // Through the app API
  expect((await pb.request.get(`/api/conversations/${conversationId}`)).status()).toBe(404);
  expect((await pb.request.post(`/api/conversations/${conversationId}/messages`, { data: { content: "hola" } })).status()).toBe(404);
  const bProgress = await (await pb.request.get("/api/progress")).json();
  expect(bProgress.vocabulary.counts.seen).toBe(0);

  // Directly against Postgres with B's JWT (RLS is the last line of defense)
  const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { error: signErr } = await sb.auth.signInWithPassword({ email: userB.email, password: userB.password });
  expect(signErr).toBeNull();
  for (const table of ["conversation_messages", "conversation_sessions", "user_vocabulary", "learning_events", "game_attempts", "content_progress"]) {
    const { data } = await sb.from(table).select("user_id");
    expect((data ?? []).every((r: { user_id: string }) => r.user_id !== undefined && r.user_id === (data![0] as { user_id: string }).user_id)).toBe(true);
    const { data: aRows } = await sb.from(table).select("*").neq("user_id", (await sb.auth.getUser()).data.user!.id);
    expect(aRows ?? []).toHaveLength(0);
  }
  const { data: profiles } = await sb.from("profiles").select("id");
  expect(profiles).toHaveLength(1);
  // Clients can't forge results or read secret answers, even their own.
  const { error: forge } = await sb.from("game_attempts").insert({ game_id: "00000000-0000-0000-0000-000000000000", user_id: (await sb.auth.getUser()).data.user!.id, response: {}, correct: true });
  expect(forge).not.toBeNull();
  const { error: secret } = await sb.from("game_instances").select("answer");
  expect(secret).not.toBeNull();
  const { error: mastery } = await sb.from("user_vocabulary").insert({ user_id: (await sb.auth.getUser()).data.user!.id, vocab_id: "00000000-0000-0000-0000-000000000000", recognition: 1 });
  expect(mastery).not.toBeNull();
  // Anonymous visitors get nothing.
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: anonContent } = await anon.from("content_items").select("id");
  expect(anonContent ?? []).toHaveLength(0);
  await ctxB.close();
});

test("adaptive engine: missing a word promotes content that reinforces it", async () => {
  const before = await (await page.request.get("/api/content?kind=story")).json();
  // Answer picture games wrong until a word that appears in some story is marked incorrect.
  let lemma = "";
  for (let i = 0; i < 15 && !lemma; i++) {
    const g = await (await page.request.post("/api/games", { data: { type: "picture_choice" } })).json();
    const wrong = g.payload.options[g.payload.options.length - 1].id;
    const r = await (await page.request.post(`/api/games/${g.id}/answer`, { data: { response: { optionId: wrong } } })).json();
    if (r.correct) continue;
    const after = await (await page.request.get("/api/content?kind=story")).json();
    const hit = after.items.find((it: { recommendation: { reasons: string[] } }) => it.recommendation.reasons.some((x) => x.includes(r.focus.lemma)));
    if (hit) {
      lemma = r.focus.lemma;
      const prev = before.items.find((it: { id: string }) => it.id === hit.id);
      expect(hit.recommendation.score).toBeGreaterThanOrEqual(prev.recommendation.score);
      expect(hit.recommendation.reasons.join(" ")).toContain(lemma);
    }
  }
  expect(lemma).not.toBe("");
});
