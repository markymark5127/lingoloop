/**
 * Feature switches. NEXT_PUBLIC_* values are inlined at build time, so they work on both the
 * server and the client (change them and redeploy).
 */

/**
 * Learner-triggered AI generation ("Make me a new video", "Write me a story"). Each new video costs
 * real money (Grok Imagine bills per second), so this is OFF unless explicitly set to "true".
 * Starter content generated with `npm run starters:hosted` is unaffected.
 */
export const GENERATION_ENABLED = process.env.NEXT_PUBLIC_GENERATION_ENABLED === "true";
