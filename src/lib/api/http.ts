import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export interface AuthedUser {
  id: string;
  email?: string;
}

/** Verify the session server-side (JWT verified by Supabase). Throws 401 if not signed in. */
export async function requireUser(): Promise<AuthedUser> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) throw new HttpError(401, "Not signed in");
  return { id: sub, email: data.claims.email as string | undefined };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, "Invalid request", z.treeifyError(r.error));
  return r.data;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wrap a route handler with consistent JSON responses and error handling. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      }
      console.error("[api]", e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

// ---- simple per-instance token bucket rate limiter (swap for Redis/Upstash in production)
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute: number) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) throw new HttpError(429, "Too many requests — slow down a little.");
  b.tokens -= 1;
  buckets.set(key, b);
}
