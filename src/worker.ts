/**
 * FactChecker Graph — Cloudflare Worker
 * Serves static assets (React SPA) and routes API requests to the Analysis Durable Object.
 */

import type { DurableObjectNamespace } from "cloudflare:workers";
import { generateId } from "./shared/id-generator";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ANALYSIS_DO: DurableObjectNamespace;
}

export { AnalysisPipelineDO } from "./do/pipeline";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── POST /api/analyze — create a new analysis ──
    if (url.pathname === "/api/analyze" && request.method === "POST") {
      try {
        const body = await request.json() as { text?: string };
        if (!body.text?.trim()) {
          return json({ error: "Text is required" }, 400);
        }

        const analysisId = generateId();
        const doId = env.ANALYSIS_DO.idFromName(analysisId);
        const stub = env.ANALYSIS_DO.get(doId);

        // Phase 1: store text in DO
        await stub.fetch(new Request("https://do.local/init", {
          method: "POST",
          body: JSON.stringify({ text: body.text }),
        }));

        return json({ analysisId });
      } catch (err) {
        return json({ error: `Failed to start analysis: ${err instanceof Error ? err.message : String(err)}` }, 500);
      }
    }

    // ── GET /api/analyze/:id/stream — SSE progress stream ──
    const streamMatch = url.pathname.match(/^\/api\/analyze\/(.+)\/stream$/);
    if (streamMatch && request.method === "GET") {
      const analysisId = streamMatch[1];
      try {
        const doId = env.ANALYSIS_DO.idFromName(analysisId);
        const stub = env.ANALYSIS_DO.get(doId);

        // Phase 2: start processing, relay SSE
        const doResponse = await stub.fetch(new Request("https://do.local/stream"));
        return doResponse;
      } catch {
        return json({ error: "Analysis not found" }, 404);
      }
    }

    // ── POST /api/analyze/:id/verify-statement — verify claim via Exa ──
    const verifyMatch = url.pathname.match(/^\/api\/analyze\/(.+)\/verify-statement$/);
    if (verifyMatch && request.method === "POST") {
      const analysisId = verifyMatch[1];
      try {
        const body = await request.json();
        const doId = env.ANALYSIS_DO.idFromName(analysisId);
        const stub = env.ANALYSIS_DO.get(doId);

        const doResponse = await stub.fetch(
          new Request("https://do.local/verify-statement", {
            method: "POST",
            body: JSON.stringify(body),
          })
        );
        return doResponse;
      } catch (err) {
        return json(
          { error: `Verification request failed: ${err instanceof Error ? err.message : String(err)}` },
          500
        );
      }
    }

    // ── Fallback: serve static assets ──
    return env.ASSETS.fetch(request);
  },
};

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
