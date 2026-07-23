/**
 * Analysis Pipeline — Cloudflare Durable Object
 * Wires the Effect-based pipeline logic to the DO environment.
 */

import { DurableObject } from "cloudflare:workers";
import { Effect, Runtime } from "effect";
import { makeAiClient, AiClientError } from "./ai-client";
import {
  preprocess,
  extractStatements,
  analyzeRelations,
  scoreStatements,
  postprocessConclusions,
  type AnalysisOutput,
} from "./pipeline-logic";
import type { Statement } from "../shared/schemas";

interface Env {
  CF_AIG_TOKEN: string;
}

export class AnalysisPipelineDO extends DurableObject<Env> {
  private currentResult: Partial<AnalysisOutput> = {};

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Init: store text for subsequent processing
    if (url.pathname.endsWith("/init") && request.method === "POST") {
      try {
        const body = await request.json() as { text?: string };
        if (body.text) {
          await this.ctx.storage.put("inputText", body.text);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Stream: process stored text and return SSE
    if (url.pathname.endsWith("/stream")) {
      return this.handleSSE(request);
    }

    return new Response("AnalysisPipelineDO", { status: 200 });
  }

  private async handleSSE(request: Request): Promise<Response> {
    const encoder = new TextEncoder();
    const token = this.env.CF_AIG_TOKEN;

    if (!token) {
      return new Response(
        encoder.encode("data: " + JSON.stringify({ type: "error", message: "CF_AIG_TOKEN not configured" }) + "\n\ndata: [DONE]\n\n"),
        { status: 500, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const client = makeAiClient(token);
    let statements: Statement[] = [];

    const stream = new ReadableStream({
      start: async (controller) => {
        const emit = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
        };

        // Get text from DO storage (set via /init)
        const text = await this.ctx.storage.get<string>("inputText");

        if (!text?.trim()) {
          emit({ type: "error", step: "validation", message: "Analysis not found — the analysis ID may be invalid or expired" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        try {
          // Step 0: Preprocess
          emit({ type: "step:start", step: 0, message: "Detecting speakers..." });
          const { speakers, userMessage } = preprocess(text);
          this.currentResult = { speakers };
          emit({ type: "step:complete", step: 0, speakers });

          // Check for abort
          if (request.signal.aborted) { controller.close(); return; }

          // Step 1: Extract statements (streaming)
          emit({ type: "step:start", step: 1, message: "Extracting statements..." });
          
          const pipelineResult = await Effect.runPromise(
            extractStatements(client, userMessage, (newStatements) => {
              statements = newStatements;
              emit({ type: "statements:update", statements, count: statements.length });
            })
          );

          if (pipelineResult.length === 0) {
            emit({ type: "step:error", step: 1, message: "No statements extracted" });
            emit({ type: "error", message: "No statements could be extracted from the text" });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          statements = pipelineResult;
          this.currentResult.statements = statements;
          emit({ type: "step:complete", step: 1, statements, count: statements.length });

          // ── Post-process: capture missed conclusions ──
          const newStatements = postprocessConclusions(text, statements);
          if (newStatements.length > statements.length) {
            statements = newStatements;
            this.currentResult.statements = statements;
            emit({ type: "statements:update", statements, count: statements.length });
          }

          if (request.signal.aborted) { controller.close(); return; }

          // Step 2: Analyze relations
          emit({ type: "step:start", step: 2, message: "Analyzing logical relationships..." });
          try {
            const relResult = await Effect.runPromise(analyzeRelations(client, statements));
            this.currentResult = { ...this.currentResult, ...relResult };
            emit({ type: "step:complete", step: 2, ...relResult });
          } catch (err) {
            emit({ type: "step:error", step: 2, message: `Relation analysis failed: ${err instanceof Error ? err.message : String(err)}` });
          }
          if (request.signal.aborted) { controller.close(); return; }

          // Step 3: Score difficulty
          emit({ type: "step:start", step: 3, message: "Scoring fact-check difficulty..." });
          try {
            const scored = await Effect.runPromise(scoreStatements(client, statements));
            this.currentResult.statements = scored;
            statements = scored;
            emit({ type: "step:complete", step: 3, statements: scored });
          } catch (err) {
            emit({ type: "step:error", step: 3, message: `Scoring failed: ${err instanceof Error ? err.message : String(err)}` });
          }

          // Done
          emit({ type: "pipeline:complete", result: this.currentResult });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          emit({ type: "error", message, partial: !!this.currentResult.statements });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }
}
