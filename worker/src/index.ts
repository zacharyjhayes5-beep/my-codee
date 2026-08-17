/**
 * The Worker: a scheduled ingestion job and a small private API.
 *
 * Endpoints, all of which require authorization:
 *
 *   GET  /leads          — leads the dashboard has not yet taken
 *   POST /leads/ack      — confirm those leads are stored locally
 *   POST /ingest         — run ingestion by hand (used to prove the pipeline)
 *   GET  /runs           — the last few ingestion runs
 *   GET  /health         — liveness, no auth, no data
 */

import { authorize, type AuthEnv } from "./auth";
import type { BatchMode } from "./config";
import { batchSize } from "./config";
import { runIngestion } from "./ingest";
import { markSynced, recentRuns, unsyncedLeads } from "./store";

export interface Env extends AuthEnv {
  DB: D1Database;
  BATCH_MODE?: string;
}

/**
 * Origins allowed to call the API from a browser.
 *
 * The dashboard is served from GitHub Pages and, in development, from Vite on
 * localhost. A wildcard would let any page on the internet attempt a call —
 * the token would still stop it, but there is no reason to widen the surface.
 */
const ALLOWED_ORIGINS = new Set([
  "https://zacharyjhayes5-beep.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/** Attach CORS to a response built elsewhere, such as an auth rejection. */
function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function json(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(request ? corsHeaders(request) : {}),
    },
  });
}

function modeOf(env: Env): BatchMode {
  return env.BATCH_MODE === "full" ? "full" : "dev";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // A 204 must not carry a body — constructing one that does throws, which
    // is what made every browser preflight fail with a 500.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (url.pathname === "/health") return json({ ok: true }, 200, request);

    const auth = authorize(request, env);
    if (!auth.ok) return withCors(auth.response, request);

    try {
      if (url.pathname === "/leads" && request.method === "GET") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
        const leads = await unsyncedLeads(env.DB, limit);
        return json({ leads, count: leads.length }, 200, request);
      }

      if (url.pathname === "/leads/ack" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
        const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : [];
        if (ids.length === 0) return json({ error: "no ids supplied" }, 400, request);
        const acknowledged = await markSynced(env.DB, ids);
        return json({ acknowledged }, 200, request);
      }

      if (url.pathname === "/ingest" && request.method === "POST") {
        const mode = modeOf(env);
        const result = await runIngestion(env.DB, mode, "manual");
        return json({ mode, batchTarget: batchSize(mode), ...result }, result.status === "ok" ? 200 : 500, request);
      }

      if (url.pathname === "/runs" && request.method === "GET") {
        return json({ runs: await recentRuns(env.DB) }, 200, request);
      }

      return json({ error: "not found" }, 404, request);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return json({ error: message }, 500, request);
    }
  },

  /**
   * The weekday cron. Errors are recorded on the run row by runIngestion, so
   * this only has to surface them in the Worker log.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runIngestion(env.DB, modeOf(env), "cron").then((result) => {
        if (result.status === "error") {
          console.error("ingestion failed", result.runId, result.error);
        } else {
          console.log(
            `ingestion ok run=${result.runId} scanned=${result.scanned} ` +
              `entities=${result.excludedEntities} seen=${result.alreadySeen} ` +
              `ownerChanges=${result.ownerChanges} eligible=${result.eligible} ` +
              `inserted=${result.inserted}`,
          );
        }
      }),
    );
  },
};
