/**
 * End-to-end fact-checking verification with real DeepSeek + Brave APIs.
 * Reads both API keys from .api-key (line 1: DeepSeek, line 2: Brave).
 * 
 * Usage: npx tsx scripts/verify-factcheck-e2e.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { runFactCheck } from "../src/factCheck";
import type { Statement, FactCheckSourceEval, FactCheckVerdict, FactCheckProgress } from "../src/types";

// ── Load API keys ────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(__dirname, "..", ".api-key");
let DEEPSEEK_KEY: string;
let BRAVE_KEY: string | null;

try {
  const lines = readFileSync(keyPath, "utf-8").split("\n").map(l => l.trim()).filter(l => l.length > 0);
  DEEPSEEK_KEY = lines[0] ?? "";
  BRAVE_KEY = lines.length >= 2 ? lines[1] : null;
} catch {
  console.error("❌ No .api-key file found at", keyPath);
  process.exit(1);
}

if (!DEEPSEEK_KEY) {
  console.error("❌ DeepSeek key not found on line 1");
  process.exit(1);
}
if (!BRAVE_KEY) {
  console.log("⚠️  No Brave key on line 2 — skipping fact-check tests");
  process.exit(0);
}

// ── Helpers ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
}

// ── Test runner ─────────────────────────────────────────────
async function testFactCheck(name: string, statement: Statement, checks: (sources: FactCheckSourceEval[], verdict: FactCheckVerdict | null, progressStages: string[]) => void) {
  console.log(`\n📋 Test: ${name}`);
  console.log(`  Statement: ${statement.text}`);
  
  const progressStages: string[] = [];
  let finalSources: FactCheckSourceEval[] = [];
  let finalVerdict: FactCheckVerdict | null = null;

  const startTime = Date.now();

  try {
    await runFactCheck(
      [statement],
      statement.text,
      DEEPSEEK_KEY,
      BRAVE_KEY!,
      {
        onProgress: (p: FactCheckProgress) => {
          if (!progressStages.includes(p.stage)) {
            progressStages.push(p.stage);
          }
          if (p.stage === "evaluating") {
            console.log(`    📊 Sources: ${p.evaluatedSources}/${p.totalSources}`);
          }
        },
        onStatementUpdate: (_id: string, sources: FactCheckSourceEval[], verdict: FactCheckVerdict | null) => {
          finalSources = sources;
          finalVerdict = verdict;
        },
      }
    );

    const elapsed = Date.now() - startTime;
    console.log(`  Completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Stages: ${progressStages.join(" → ")}`);
    console.log(`  Sources found: ${finalSources.length}`);
    console.log(`  Verdict: ${finalVerdict?.truthAssessment ?? "none"}`);
    console.log(`  Confidence: ${finalVerdict?.confidence ?? 0}%`);

    // Print source summary
    const proveCount = finalSources.filter(s => s.verdict === "prove").length;
    const disproveCount = finalSources.filter(s => s.verdict === "disprove").length;
    const neitherCount = finalSources.filter(s => s.verdict === "neither").length;
    console.log(`  Breakdown: ${proveCount} prove, ${disproveCount} disprove, ${neitherCount} neither`);

    checks(finalSources, finalVerdict, progressStages);
  } catch (err) {
    console.log(`  ❌ Fact-check threw: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ── Run tests ───────────────────────────────────────────────
async function main() {
  console.log("══════════════════════════════════════════════════");
  console.log("Fact-Check E2E Tests (DeepSeek + Brave APIs)");
  console.log("══════════════════════════════════════════════════");

  // ── Test 1: Simple factual claim ───────────────────────────
  await testFactCheck("Simple factual claim", {
    id: "S1",
    text: "Socrates was a Greek philosopher who lived in Athens",
    factCheckDifficulty: 10,
  }, (sources, verdict, stages) => {
    assert(stages.includes("generating_terms"), "Search terms generated");
    assert(stages.includes("searching"), "Brave search executed");
    assert(stages.includes("evaluating"), "Sources evaluated");
    assert(stages.includes("finalizing"), "Verdict finalized");
    assert(sources.length > 0, `Found > 0 sources (got ${sources.length})`);
    assert(verdict !== null, "Verdict produced");
    assert(verdict !== null && verdict.confidence >= 0 && verdict.confidence <= 100, "Confidence in 0-100 range");
    if (verdict) {
      assert(verdict.confidence > 40, `Confidence > 40 for simple fact (got ${verdict.confidence})`);
    }
  });

  // ── Test 2: Disproven claim ───────────────────────────────
  await testFactCheck("Disproven claim", {
    id: "S2",
    text: "The Earth is flat and does not orbit the Sun",
    factCheckDifficulty: 15,
  }, (sources, verdict, stages) => {
    assert(sources.length > 0, `Found > 0 sources (got ${sources.length})`);
    assert(verdict !== null, "Verdict produced");
    if (verdict) {
      assert(verdict.contradictingEvidence.length > 0 || verdict.confidence < 50,
        `Has contradicting evidence or low confidence (conf: ${verdict.confidence}, contradicting: ${verdict.contradictingEvidence.length})`);
    }
    const disproveSources = sources.filter(s => s.verdict === "disprove");
    assert(disproveSources.length >= 1, `≥ 1 source disproves (got ${disproveSources.length})`);
  });

  // ── Test 3: Difficult/future claim ─────────────────────────
  await testFactCheck("Difficult claim", {
    id: "S3",
    text: "AI will surpass human intelligence in all domains by 2030",
    factCheckDifficulty: 85,
  }, (sources, verdict, _stages) => {
    assert(sources.length > 0, `Found > 0 sources (got ${sources.length})`);
    // Verdict may or may not exist (difficult claims are allowed to fail)
    if (verdict) {
      // Mixed or uncertain — confidence should not be extremely high
      assert(verdict.confidence <= 90, `Confidence ≤ 90 for speculative claim (got ${verdict.confidence})`);
    }
  });

  // ── Test 4: Verifiability scaling ──────────────────────────
  console.log("\n📋 Test: Verifiability scaling");
  // Track by checking that higher difficulty = more sources requested
  let lowSourceCount = 0;
  let highSourceCount = 0;

  const lowStmt: Statement = { id: "S4", text: "Water boils at 100°C at sea level", factCheckDifficulty: 10 };
  const highStmt: Statement = { id: "S5", text: "Consciousness is an emergent property of quantum processes in neural microtubules", factCheckDifficulty: 90 };

  const progressTotals: Record<string, number> = {};

  try {
    await runFactCheck(
      [lowStmt, highStmt],
      "Test scaling",
      DEEPSEEK_KEY,
      BRAVE_KEY!,
      {
        onProgress: (p) => {
          if (p.stage === "evaluating") {
            progressTotals[p.statementId] = p.totalSources;
          }
        },
        onStatementUpdate: () => {},
      }
    );

    lowSourceCount = progressTotals["S4"] ?? 0;
    highSourceCount = progressTotals["S5"] ?? 0;
    console.log(`  Low difficulty sources: ${lowSourceCount}, High difficulty sources: ${highSourceCount}`);
    assert(highSourceCount >= lowSourceCount, `High difficulty (${highSourceCount}) ≥ low difficulty (${lowSourceCount}) sources`);
  } catch (err) {
    console.log(`  ❌ Scaling test threw: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }

  // ── Test 5: Source evaluation structure ───────────────────
  await testFactCheck("Source evaluation structure", {
    id: "S6",
    text: "Python was created by Guido van Rossum",
    factCheckDifficulty: 5,
  }, (sources, verdict, _stages) => {
    if (sources.length > 0) {
      const src = sources[0];
      assert(typeof src.url === "string" && src.url.startsWith("http"), "Source has valid URL");
      assert(typeof src.title === "string" && src.title.length > 0, "Source has title");
      assert(typeof src.hostname === "string" && src.hostname.length > 0, "Source has hostname");
      assert(["prove", "disprove", "neither"].includes(src.verdict), "Source verdict is valid enum value");
      assert(typeof src.explanation === "string" && src.explanation.length > 0, "Source has explanation");
    }
    if (verdict) {
      assert(typeof verdict.truthAssessment === "string" && verdict.truthAssessment.length > 0, "Verdict has truth assessment");
      assert(Array.isArray(verdict.supportingEvidence), "Supporting evidence is array");
      assert(Array.isArray(verdict.contradictingEvidence), "Contradicting evidence is array");
      assert(verdict.confidence >= 0 && verdict.confidence <= 100, "Confidence 0-100");
    }
  });

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════════`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
