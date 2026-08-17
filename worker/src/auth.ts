/**
 * Request authorization — the single seam the whole API depends on.
 *
 * This file exists so that moving to Cloudflare Access later touches nothing
 * else. `authorize()` is the only thing the request handler calls, and neither
 * the ingestion pipeline nor the database layer knows how a caller is
 * identified. Swapping the body of this function for JWT verification against
 * Access is the entire migration.
 *
 * PHASE 1, TEMPORARY: a shared bearer token, held as a Cloudflare Worker
 * Secret. It is never committed, never in the frontend bundle, and never in a
 * static file — the dashboard asks for it once and keeps it in localStorage.
 * That is deliberately not a permanent design; it is the smallest thing that
 * proves the pipeline, and it is quarantined here so replacing it is cheap.
 */

export interface AuthEnv {
  /** Set with: wrangler secret put API_TOKEN */
  API_TOKEN?: string;
}

export type AuthResult = { ok: true } | { ok: false; response: Response };

const DENIED: AuthResult = {
  ok: false,
  response: new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  }),
};

export function authorize(request: Request, env: AuthEnv): AuthResult {
  const expected = env.API_TOKEN;

  // A missing secret must fail closed. An unset token that allowed traffic
  // through would silently publish homeowner data.
  if (!expected) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "server not configured" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return DENIED;

  return timingSafeEqual(presented, expected) ? { ok: true } : DENIED;
}

/**
 * Constant-time comparison, so the number of correct leading characters cannot
 * be read off the response time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
