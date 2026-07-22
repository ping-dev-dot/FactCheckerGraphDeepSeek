/**
 * Step 4: Fact-checking orchestrator.
 * Batch search terms → parallel Brave searches → parallel source evals → verdict.
 * Each step emits progress; failures are per-statement, never crash the whole step.
 */

import { chatCompletion } from "./streaming";
import { searchBraveLLMContext } from "./braveSearch";
import type { BraveSourceSnippet } from "./braveSearch";
import {
  STEP4_SEARCH_TERMS_PROMPT,
  STEP4_SOURCE_EVAL_PROMPT,
  STEP4_VERDICT_PROMPT,
} from "./prompts";
import type {
  Statement,
  FactCheckSourceEval,
  FactCheckVerdict,
  FactCheckProgress,
} from "./types";

const MODEL = "deepseek-chat";

export interface FactCheckCallbacks {
  onProgress: (progress: FactCheckProgress) => void;
  onStatementUpdate: (
    statementId: string,
    sources: FactCheckSourceEval[],
    verdict: FactCheckVerdict | null
  ) => void;
}

function searchParamsForDifficulty(difficulty: number): {
  count: number;
  maxTokens: number;
} {
  if (difficulty <= 30) return { count: 3, maxTokens: 2048 };
  if (difficulty <= 70) return { count: 10, maxTokens: 8192 };
  return { count: 15, maxTokens: 16384 };
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) try { return JSON.parse(fence[1].trim()); } catch {}
  const brace = trimmed.match(/\{[\s\S]*\}/);
  if (brace) try { return JSON.parse(brace[0].trim()); } catch {}
  throw new Error("Failed to extract JSON from response");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run fact-checking on all statements using Brave LLM Context + DeepSeek.
 * Parallelizes aggressively: batched search terms, parallel Brave searches, parallel source evals.
 */
export async function runFactCheck(
  statements: Statement[],
  originalText: string,
  deepseekApiKey: string,
  braveApiKey: string,
  callbacks: FactCheckCallbacks
): Promise<void> {
  const { onProgress, onStatementUpdate } = callbacks;

  // ── 4a: Generate search terms for ALL statements in one batch call ──
  const stmtList = statements
    .map((s) => `[${s.id}]: ${s.text}`)
    .join("\n");

  onProgress({
    stage: "generating_terms",
    statementId: statements[0]?.id ?? "",
    totalSources: 0,
    evaluatedSources: 0,
  });

  const termsResponse = await chatCompletion({
    apiKey: deepseekApiKey,
    model: MODEL,
    systemPrompt: STEP4_SEARCH_TERMS_PROMPT,
    userMessage: `Statements to generate search queries for:\n\n${stmtList}`,
    maxTokens: 2048,
  });

  const termsData = extractJson(termsResponse) as Record<
    string,
    { prove_query: string; disprove_query: string }
  >;

  // ── 4b+4c+4d: Process statements with limited concurrency ──
  const CONCURRENCY = 3;
  const processingStatements = statements.filter((s) => termsData[s.id]);

  // Process in batches of CONCURRENCY
  for (let i = 0; i < processingStatements.length; i += CONCURRENCY) {
    const batch = processingStatements.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (stmt) => {
        const queries = termsData[stmt.id];
        if (!queries) return;

        try {
          // ── 4b: Search Brave in parallel ──
          onProgress({
            stage: "searching",
            statementId: stmt.id,
            totalSources: 0,
            evaluatedSources: 0,
          });

          const params = searchParamsForDifficulty(
            stmt.factCheckDifficulty
          );

          const [proveResult, disproveResult] = await Promise.all([
            searchBraveLLMContext({
              apiKey: braveApiKey,
              query: queries.prove_query,
              count: params.count,
              maxTokens: params.maxTokens,
            }),
            searchBraveLLMContext({
              apiKey: braveApiKey,
              query: queries.disprove_query,
              count: params.count,
              maxTokens: params.maxTokens,
            }),
          ]);

          // Deduplicate sources by URL
          const sourceMap = new Map<string, BraveSourceSnippet>();
          for (const r of [proveResult, disproveResult]) {
            for (const s of r.grounding?.generic ?? []) {
              if (!sourceMap.has(s.url)) {
                sourceMap.set(s.url, s);
              }
            }
          }
          const allSources = [...sourceMap.values()];

          if (allSources.length === 0) {
            onProgress({
              stage: "finalizing",
              statementId: stmt.id,
              totalSources: 0,
              evaluatedSources: 0,
            });
            onStatementUpdate(stmt.id, [], null);
            return;
          }

          // ── 4c: Evaluate all sources in parallel (max 5 concurrent) ──
          onProgress({
            stage: "evaluating",
            statementId: stmt.id,
            totalSources: allSources.length,
            evaluatedSources: 0,
          });

          let evaluatedCount = 0;
          const evaluations: FactCheckSourceEval[] = [];

          // Process in sub-batches of 5
          const EVAL_CONCURRENCY = 5;
          for (let j = 0; j < allSources.length; j += EVAL_CONCURRENCY) {
            const evalBatch = allSources.slice(j, j + EVAL_CONCURRENCY);
            const results = await Promise.all(
              evalBatch.map(async (source) => {
                try {
                  const response = await chatCompletion({
                    apiKey: deepseekApiKey,
                    model: MODEL,
                    systemPrompt: STEP4_SOURCE_EVAL_PROMPT,
                    userMessage: [
                      `CONTEXT: ${originalText.slice(0, 500)}`,
                      `STATEMENT: ${stmt.text}`,
                      `SOURCE URL: ${source.url}`,
                      `SOURCE TITLE: ${source.title}`,
                      `SOURCE CONTENT:\n${(source.snippets ?? [""]).join("\n").slice(0, 2000)}`,
                    ].join("\n\n"),
                    maxTokens: 512,
                  });

                  const evalData = extractJson(response) as {
                    verdict: "prove" | "disprove" | "neither";
                    explanation: string;
                  };

                  const hostname = new URL(source.url).hostname;
                  return {
                    url: source.url,
                    title: source.title,
                    hostname,
                    verdict: evalData.verdict,
                    explanation: evalData.explanation,
                  } satisfies FactCheckSourceEval;
                } catch {
                  const hostname = (() => {
                    try { return new URL(source.url).hostname; } catch { return source.url; }
                  })();
                  return {
                    url: source.url,
                    title: source.title,
                    hostname,
                    verdict: "neither" as const,
                    explanation: "Evaluation failed",
                  } satisfies FactCheckSourceEval;
                }
              })
            );

            evaluations.push(...results);
            evaluatedCount = evaluations.length;

            // Emit progress + partial results after each sub-batch
            onProgress({
              stage: "evaluating",
              statementId: stmt.id,
              totalSources: allSources.length,
              evaluatedSources: evaluatedCount,
              currentSource: results.length > 0
                ? {
                    url: results[results.length - 1].url,
                    title: results[results.length - 1].title,
                    verdict: results[results.length - 1].verdict,
                  }
                : undefined,
            });

            onStatementUpdate(stmt.id, [...evaluations], null);
          }

          // ── 4d: Compile final verdict ──
          onProgress({
            stage: "finalizing",
            statementId: stmt.id,
            totalSources: allSources.length,
            evaluatedSources: evaluatedCount,
          });

          try {
            const evalText = evaluations
              .map(
                (e) =>
                  `[${e.verdict.toUpperCase()}] ${e.hostname}: ${e.explanation}`
              )
              .join("\n");

            const verdictResponse = await chatCompletion({
              apiKey: deepseekApiKey,
              model: MODEL,
              systemPrompt: STEP4_VERDICT_PROMPT,
              userMessage: [
                `STATEMENT: ${stmt.text}`,
                `SOURCE EVALUATIONS:\n${evalText}`,
              ].join("\n\n"),
              maxTokens: 1024,
            });

            const verdictData = extractJson(verdictResponse) as {
              truthAssessment: string;
              supportingEvidence: string[];
              contradictingEvidence: string[];
              confidence: number;
            };

            const verdict: FactCheckVerdict = {
              statementId: stmt.id,
              truthAssessment: verdictData.truthAssessment,
              supportingEvidence: verdictData.supportingEvidence ?? [],
              contradictingEvidence: verdictData.contradictingEvidence ?? [],
              confidence: Math.min(100, Math.max(0, verdictData.confidence ?? 50)),
            };

            onStatementUpdate(stmt.id, evaluations, verdict);
          } catch {
            onStatementUpdate(stmt.id, evaluations, null);
          }
        } catch {
          // Statement fact-check failed entirely — emit progress to unblock UI
          onProgress({
            stage: "finalizing",
            statementId: stmt.id,
            totalSources: 0,
            evaluatedSources: 0,
          });
          onStatementUpdate(stmt.id, [], null);
        }
      })
    );

    // Rate limit between batches
    if (i + CONCURRENCY < processingStatements.length) {
      await sleep(200);
    }
  }
}
