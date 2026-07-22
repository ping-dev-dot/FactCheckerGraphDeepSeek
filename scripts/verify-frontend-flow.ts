/**
 * Frontend integration test — simulates App.tsx behavior exactly.
 * Tests that all callbacks fire and state transitions work correctly.
 * 
 * Usage: npx tsx scripts/verify-frontend-flow.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { runAnalysisPipeline } from "../src/pipeline";
import type {
  PipelineProgress,
  FactCheckProgress,
  FactCheckSourceEval,
  FactCheckVerdict,
  Statement,
  PartialAnalysisResult,
  AnalysisResult,
} from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyRaw = readFileSync(resolve(__dirname, "..", ".api-key"), "utf-8").trim();
const lines = keyRaw.split("\n");
const DEEPSEEK_KEY = lines[0].trim();
const BRAVE_KEY = lines.length > 1 ? lines[1].trim() : "";

const TEXT = `Alice: Climate change is the most urgent crisis facing humanity. We need to invest trillions in renewable energy immediately.

Bob: I think that's completely wrong. Renewable energy is too expensive and unreliable. We should focus on nuclear power instead.`;

// ── Simulate App.tsx state ──
let result: AnalysisResult | null = null;
let partialResult: PartialAnalysisResult | null = null;
let pipelineProgress: PipelineProgress | null = null;
let factCheckProgress: Record<string, FactCheckProgress> = {};

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

function assertState(label: string, checks: () => void) {
  console.log(`\n📋 ${label}`);
  try {
    checks();
  } catch (e) {
    console.log(`  💥 ${e}`);
    failed++;
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════");
  console.log("Frontend Flow Simulation (App.tsx behavior)");
  console.log("══════════════════════════════════════════════════");

  const callbacks: string[] = [];
  const progressTimeline: string[] = [];
  let lastStatementCount = 0;

  const finalResult = await runAnalysisPipeline(
    TEXT,
    DEEPSEEK_KEY,
    // onProgress — same as App.tsx
    (progress) => {
      pipelineProgress = progress;
      progressTimeline.push(`${progress.stage}:${progress.message}`);
      callbacks.push(`progress:${progress.stage}`);
    },
    // onStatements — same as App.tsx
    (statements) => {
      partialResult = { ...partialResult, statements };
      if (statements.length !== lastStatementCount) {
        callbacks.push(`statements:${statements.length}`);
        lastStatementCount = statements.length;
      }
    },
    // onPartialResult — same as App.tsx
    (partial) => {
      partialResult = partial;
      callbacks.push(`partial:r${partial.relations?.length ?? 0},f${partial.fallacies?.length ?? 0}`);
    },
    // braveApiKey — same as App.tsx
    BRAVE_KEY || undefined,
    // onFactCheckProgress — same as App.tsx
    (progress) => {
      factCheckProgress = {
        ...factCheckProgress,
        [progress.statementId]: progress,
      };
      callbacks.push(`fc-progress:${progress.stage}:${progress.statementId}`);
    },
    // onStatementFactChecked — same as App.tsx
    (statementId, sources, verdict) => {
      // Update result in-place (simulating setResult)
      if (result) {
        result = {
          ...result,
          statements: result.statements.map((s) =>
            s.id === statementId
              ? { ...s, factCheckSources: sources, factCheckResult: verdict ?? undefined } as any
              : s
          ),
        };
      }
      // Also update partialResult
      if (partialResult?.statements) {
        partialResult = {
          ...partialResult,
          statements: partialResult.statements.map((s) =>
            s.id === statementId
              ? { ...s, factCheckSources: sources, factCheckResult: verdict ?? undefined } as any
              : s
          ),
        };
      }
      const vLabel = verdict ? `verdict:conf${verdict.confidence}` : "verdict:null";
      callbacks.push(`fc-update:${statementId}:${sources.length}sources:${vLabel}`);
    }
  );

  // Final result set (same as App.tsx handleSubmit)
  result = finalResult;
  console.log(`Pipeline completed in stages: ${progressTimeline.map(p => p.split(":")[0]).join(" → ")}`);

  // ── Verify callbacks fired ──
  assertState("Preprocessing", () => {
    assert(callbacks.some(c => c.startsWith("progress:preprocessing")), "Preprocessing stage ran");
  });

  assertState("Step 1 — Statement extraction", () => {
    assert(callbacks.some(c => c.startsWith("progress:extracting")), "Extracting stage ran");
    assert(callbacks.some(c => c.startsWith("statements:")), "Statements callback fired");
    const stmtCount = finalResult.statements.length;
    assert(stmtCount >= 4, `Has >= 4 statements (${stmtCount})`);
  });

  assertState("Step 2 — Relation analysis", () => {
    assert(callbacks.some(c => c.startsWith("progress:analyzing_relations")), "Relation stage ran");
    assert(callbacks.some(c => c.startsWith("partial:")), "Partial result callback fired");
  });

  assertState("Step 3 — Fact-check scoring", () => {
    const hasScoring = callbacks.some(c => c.startsWith("progress:scoring"));
    console.log(`  Scoring ran: ${hasScoring}`);
  });

  // ── Step 4 checks ──
  const fcCallbacks = callbacks.filter(c => c.startsWith("fc-"));
  console.log(`\n📋 Step 4 — Fact-checking`);
  console.log(`  Fact-check callbacks: ${fcCallbacks.length} total`);
  fcCallbacks.forEach(c => console.log(`    ${c}`));

  assertState("Fact-check callbacks exist", () => {
    assert(fcCallbacks.length > 0, "At least one fact-check callback fired");

    const progressCalls = fcCallbacks.filter(c => c.startsWith("fc-progress:"));
    const updateCalls = fcCallbacks.filter(c => c.startsWith("fc-update:"));

    console.log(`  Progress calls: ${progressCalls.length}, Update calls: ${updateCalls.length}`);

    // Check each stage
    const stages = new Set(progressCalls.map(c => c.split(":")[1]));
    console.log(`  Stages seen: ${[...stages].join(", ")}`);

    assert(stages.has("generating_terms"), "generating_terms stage seen");
    assert(stages.has("searching"), "searching stage seen");
    assert(stages.has("evaluating"), "evaluating stage seen");
    assert(stages.has("finalizing"), "finalizing stage seen");

    // Check at least one statement got sources
    const updateWithSources = updateCalls.filter(c => !c.includes("0sources"));
    assert(updateWithSources.length > 0, "At least one statement got sources");

    // Check at least one verdict was produced
    const updateWithVerdict = updateCalls.filter(c => c.includes("verdict:conf"));
    assert(updateWithVerdict.length > 0, "At least one verdict was produced");
  });

  assertState("Statement fact-check data", () => {
    const statements = result?.statements ?? [];
    const withSources = statements.filter((s: any) => (s.factCheckSources ?? []).length > 0);
    const withVerdict = statements.filter((s: any) => s.factCheckResult != null);

    console.log(`  With sources: ${withSources.length}/${statements.length}`);
    console.log(`  With verdicts: ${withVerdict.length}/${statements.length}`);

    assert(withSources.length > 0, "At least one statement has factCheckSources");
    assert(withVerdict.length > 0, "At least one statement has factCheckResult");

    // Show details for first statement with sources
    const first = statements.find((s: any) => (s.factCheckSources ?? []).length > 0);
    if (first) {
      const sources = (first as any).factCheckSources as FactCheckSourceEval[];
      const verdict = (first as any).factCheckResult as FactCheckVerdict | undefined;
      console.log(`\n  Example: ${first.id}: "${first.text.slice(0, 50)}..."`);
      console.log(`    Sources: ${sources.length}`);
      sources.forEach((s: FactCheckSourceEval) => {
        console.log(`      ${s.verdict === "prove" ? "✓" : s.verdict === "disprove" ? "✗" : "—"} ${s.hostname}: ${s.explanation.slice(0, 60)}...`);
      });
      if (verdict) {
        console.log(`    Verdict: ${verdict.truthAssessment}`);
        console.log(`    Confidence: ${verdict.confidence}%`);
        console.log(`    Supporting: ${verdict.supportingEvidence.length}, Contradicting: ${verdict.contradictingEvidence.length}`);
      } else {
        console.log(`    Verdict: null (still pending or failed)`);
      }
    }
  });

  // ── Summary ──
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════════`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
