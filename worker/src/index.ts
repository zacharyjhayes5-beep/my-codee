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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // The dashboard is served from GitHub Pages, a different origin.
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function modeOf(env: Env): BatchMode {
  return env.BATCH_MODE === "full" ? "full" : "dev";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return json({}, 204);
    if (url.pathname === "/health") return json({ ok: true });

    const auth = authorize(request, env);
    if (!auth.ok) return auth.response;

    try {
      if (url.pathname === "/leads" && request.method === "GET") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
        const leads = await unsyncedLeads(env.DB, limit);
        return json({ leads, count: leads.length });
      }

      if (url.pathname === "/leads/ack" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
        const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : [];
        if (ids.length === 0) return json({ error: "no ids supplied" }, 400);
        const acknowledged = await markSynced(env.DB, ids);
        return json({ acknowledged });
      }

      if (url.pathname === "/ingest" && request.method === "POST") {
        const mode = modeOf(env);
        const result = await runIngestion(env.DB, mode, "manual");
        return json({ mode, batchTarget: batchSize(mode), ...result }, result.status === "ok" ? 200 : 500);
      }

      if (url.pathname === "/runs" && request.method === "GET") {
        return json({ runs: await recentRuns(env.DB) });
      }

      return json({ error: "not found" }, 404);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return json({ error: message }, 500);
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
