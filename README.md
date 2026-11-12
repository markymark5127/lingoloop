# LingoLoop

An AI-powered Spanish immersion app for adults. You learn through short videos, narrated stories, mini-games and roleplay conversations, and **one adaptive learning engine** personalizes all four. A word you miss in a game comes back in your next recommended story. A word you use correctly in conversation counts as production practice.

**Stack:** TypeScript · Next.js 16 (App Router, Route Handlers) · React 19 · Tailwind v4 · Zod · Supabase (Postgres + RLS, Auth, Storage) · OpenAI (text, TTS, STT) · Playwright + ffmpeg media worker · Vitest + Playwright tests.

## Quick start (local)

Prerequisites: Node 20+, Docker or Podman, the Supabase CLI, ffmpeg, espeak-ng.

```bash
npm install
npx playwright install chromium        # used by the video renderer and the e2e tests
supabase start                         # Podman: export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock
cp .env.example .env.local             # fill in the keys printed by `supabase start`
supabase db reset                      # applies supabase/migrations
npm run seed                           # vocabulary, starter stories, starter video scripts
npm run worker -- --once               # renders the 6 starter videos into real MP4s
npm run build && npm start             # http://localhost:3000
npm run worker                         # in a second terminal: processes generation jobs
```

Set `OPENAI_API_KEY` in `.env.local` to turn on live LLM generation, AI conversation, OpenAI TTS narration and server-side transcription. Without a key, the app runs on its **offline content engine** (template-based generation, a rule-based roleplay partner, espeak-ng narration, browser speech APIs). The UI labels which engine is active.

Password-reset emails go to Mailpit locally: http://127.0.0.1:54324.

## Tests

```bash
npm test                 # Vitest: learning engine (mastery, SM-2, levels, recommendations, games)
npm run test:e2e         # Playwright: full reviewer journey + generation pipeline (worker must be running)
npm run typecheck && npm run lint
```

The e2e suite covers: signup → onboarding → playable video with tap-to-translate and saved words → story narration, bookmarking and comprehension → 6 game types with server-validated feedback (plus replay protection) → conversation with end-of-session corrections → progress reflects activity → logout/login persistence → a second account can't read the first account's data, through the API **and** directly against Postgres with its own JWT → the adaptive engine re-ranks content after a missed word → async video/story generation through the worker.

## Architecture

```
Browser (React)  ──auth only──▶ Supabase Auth
     │
     ▼ fetch (session cookie)
Next.js route handlers ── verify JWT (getClaims) ── Zod-validate ── rate limit / quotas
     │                    │
     │                    ├─ learning service (src/lib/learning) ─ engine (src/lib/engine, pure TS)
     │                    └─ AI provider (OpenAI | offline)
     ▼
Postgres (RLS on every table) ◀── media worker (worker/) ── claims jobs with FOR UPDATE SKIP LOCKED
                                      script → narration (TTS/espeak) → frames (Chromium) → ffmpeg MP4 + WebVTT → Storage
```

- **Learning engine** (`src/lib/engine`): deterministic, unit-tested TypeScript. It keeps separate recognition / listening / production estimates for each word. Passive exposure is capped at 0.3, so time alone never makes a word "strong". SM-2 spaced review schedules each word, and CEFR bands change only from accuracy plus retained words. Content scoring favors mostly-familiar material with a few due words and ≤25% new words.
- **Security:** the browser never queries data tables directly. RLS still enforces own-rows-only reads. Integrity-sensitive tables (attempts, mastery, events) are read-only to clients, so the server writes them after validating. Secret game answers are excluded from client SELECT with column privileges. Comprehension answers are stripped before content leaves the server. API keys are server-only.
- **AI safety rails:** every AI response is Zod-validated and checked for Spanish-ness and sentence length per level, then retried with the errors fed back, or rejected. Games are data-only templates rendered by fixed components. The AI never sends code to the browser.

## What works / what's incomplete

Working: everything in the e2e list above, plus dark/light theme, mobile bottom nav / desktop sidebar, account deletion, password reset, daily goal/streak/history, recommendations, and a story-challenge game built from watched videos.

Not done / limitations:
- **Not deployed.** Vercel deployment needs a hosted Supabase project, and the worker needs a host with ffmpeg + Chromium (any container host).
- Video rendering uses Chromium-rendered scene cards (emoji art) + ffmpeg rather than Remotion or AI image/video generation.
- The voice round-trip can't be automated in headless tests. Microphone input uses browser SpeechRecognition, or OpenAI transcription when a key is set.
- In audio-match games the spoken word is sent to the client (needed for browser TTS), so a determined user could inspect it.
- The rate limiter is in-memory, per instance. Use Redis/Upstash in production.
- Spanish for English speakers only; the schema is multi-language ready.
