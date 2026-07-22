/**
 * End-to-end pipeline verification with real DeepSeek API calls.
 * Reads API key from .api-key file in project root.
 * 
 * Usage: npx tsx scripts/verify-pipeline-e2e.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { runAnalysisPipeline } from "../src/pipeline";
import type { PipelineProgress, PartialAnalysisResult, Statement, AnalysisResult } from "../src/types";

// ── Load API key ────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = resolve(__dirname, "..", ".api-key");
let API_KEY: string;
try {
  API_KEY = readFileSync(keyPath, "utf-8").trim();
} catch {
  console.error("❌ No .api-key file found at", keyPath);
  console.error("   Create it with your DeepSeek API key (just the key, no quotes).");
  process.exit(1);
}
if (!API_KEY) {
  console.error("❌ .api-key file is empty.");
  process.exit(1);
}

// ── Test inputs ─────────────────────────────────────────────
const MULTI_SPEAKER_TEXT = `Alice: Climate change is the most urgent crisis facing humanity. We need to invest trillions in renewable energy immediately.

Bob: I think that's completely wrong. Renewable energy is too expensive and unreliable. We should focus on nuclear power instead.

Alice: But nuclear has its own risks — just look at Chernobyl and Fukushima. Solar and wind have gotten dramatically cheaper in the last decade.

Bob: That's cherry-picking. The cost of solar might have dropped, but you can't power a factory or a hospital with intermittent energy. Nuclear provides reliable baseload power and it's carbon-free.

Alice: So you're admitting climate change is a problem, then?

Bob: I never said it wasn't a problem. I said it's not the most urgent crisis. Economic stability matters more — if we destroy our economy chasing renewables, we won't have resources to address anything else.

Alice: That's a false dilemma. We can transition to renewables while maintaining economic growth. Germany and Denmark are doing it right now.`;

const SINGLE_SPEAKER_TEXT = `We know the Bible is true because it is the word of God.
We know God exists because the Bible tells us so.
The Bible is the inerrant word of God because it says so itself.`;

// ── Helpers ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Test runner ─────────────────────────────────────────────
async function testPipeline(name: string, text: string, checks: (result: AnalysisResult, events: string[]) => void) {
  console.log(`\n📋 Test: ${name}`);
  const events: string[] = [];
  let lastStatements: Statement[] = [];
  let lastPartial: PartialAnalysisResult | null = null;
  let progressLog: string[] = [];

  const startTime = Date.now();

  try {
    const result = await runAnalysisPipeline(
      text,
      API_KEY,
      (p: PipelineProgress) => {
        progressLog.push(`${p.stage}: ${p.message}`);
        events.push(`progress:${p.stage}`);
      },
      (statements: Statement[]) => {
        lastStatements = statements;
        events.push(`statements:${statements.length}`);
      },
      (partial: PartialAnalysisResult) => {
        lastPartial = partial;
        events.push(`partial:relations=${partial.relations?.length ?? 0},fallacies=${partial.fallacies?.length ?? 0},cycles=${partial.cycles?.length ?? 0}`);
      }
    );

    const elapsed = Date.now() - startTime;
    console.log(`  Completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Progress stages: ${progressLog.map(p => p.split(":")[0]).join(" → ")}`);
    console.log(`  Statements: ${result.statements.length}`);
    console.log(`  Relations: ${result.relations.length}`);
    console.log(`  Fallacies: ${(result.fallacies ?? []).length}`);
    console.log(`  Cycles: ${(result.cycles ?? []).length}`);

    checks(result, events);
  } catch (err) {
    console.log(`  ❌ Pipeline threw: ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ── Run tests ───────────────────────────────────────────────
async function main() {
  console.log("══════════════════════════════════════════════════");
  console.log("Pipeline E2E Tests (real DeepSeek API calls)");
  console.log("══════════════════════════════════════════════════");

  // ── Test 1: Multi-speaker ──────────────────────────────────
  await testPipeline("Multi-speaker argument (Alice vs Bob)", MULTI_SPEAKER_TEXT, (result, events) => {
    // Pipeline structure
    assert(events.includes("progress:preprocessing"), "Preprocessing stage ran");
    assert(events.includes("progress:extracting"), "Extraction stage ran");
    assert(events.includes("progress:analyzing_relations"), "Relation analysis stage ran");
    assert(events.some(e => e.startsWith("statements:")), "Statements callback fired");
    assert(events.some(e => e.startsWith("partial:")), "Partial result callback fired");

    // Statements
    assert(result.statements.length >= 4, `Has >= 4 statements (got ${result.statements.length})`);
    assert(result.statements.every(s => s.id.match(/^S\d+$/)), "All statement IDs match S1, S2, ...");
    assert(result.statements.every(s => s.text.length > 5), "All statements have non-trivial text");

    // Speaker attribution
    const speakers = result.speakers ?? [];
    assert(speakers.length >= 2, `Detected >= 2 speakers (got ${speakers.length})`);
    const aliceStatements = result.statements.filter(s => s.speakerId?.toLowerCase().includes("alice"));
    const bobStatements = result.statements.filter(s => s.speakerId?.toLowerCase().includes("bob"));
    assert(aliceStatements.length > 0, `Alice has statements (${aliceStatements.length})`);
    assert(bobStatements.length > 0, `Bob has statements (${bobStatements.length})`);

    // Self-contained check: no dangling references
    const danglingWords = /\b(this claim|that claim|the premise|her argument|what he said|the above|as mentioned)\b/i;
    const danglers = result.statements.filter(s => danglingWords.test(s.text));
    assert(danglers.length === 0,
      danglers.length === 0
        ? "No statements have dangling references"
        : `❌ ${danglers.length} dangling: ${danglers.map(s => s.id + ': ' + s.text.slice(0, 40)).join('; ')}`);

    // No meta-reports
    const metaPatterns = /^Speaker \w+ (disagrees|agrees|claims|argues|states|says|believes|thinks|rejects|questions|asserts)/i;
    const metaStatements = result.statements.filter(s => metaPatterns.test(s.text));
    assert(metaStatements.length === 0,
      metaStatements.length === 0
        ? "No meta-report statements"
        : `❌ ${metaStatements.length} meta-reports: ${metaStatements.map(s => s.id + ': ' + s.text.slice(0, 50)).join('; ')}`);

    // Relations exist
    assert(result.relations.length >= 2, `Has >= 2 relations (got ${result.relations.length})`);
    assert(result.relations.every(r => r.from.match(/^S\d+$/) && r.to.match(/^S\d+$/)),
      "All relations reference valid statement IDs");

    // Bob's contradiction should be detected as a relation
    const contradictions = result.relations.filter(r => r.type === "contradiction");
    console.log(`  Contradiction relations found: ${contradictions.length}`);
    if (contradictions.length > 0) {
      contradictions.forEach(c => console.log(`    ${c.from} → ${c.to}: ${c.details ?? '(no details)'}`));
    }

    // Print all statements for manual review
    console.log("\n  ── Extracted statements ──");
    result.statements.forEach(s => {
      const spk = s.speakerId ? ` [${s.speakerId}]` : "";
      console.log(`    ${s.id}${spk}: ${s.text}`);
    });

    // Print cycles if any
    if ((result.cycles ?? []).length > 0) {
      console.log("\n  ── Cycles ──");
      result.cycles!.forEach(c => console.log(`    ${c.nodeIds.join(" → ")}: ${c.description}`));
    }
  });

  // ── Test 2: Single-speaker circular ────────────────────────
  await testPipeline("Single-speaker circular reasoning", SINGLE_SPEAKER_TEXT, (result, events) => {
    assert(result.statements.length >= 3, `Has >= 3 statements (got ${result.statements.length})`);

    // Should detect the circular reasoning cycle
    const cycles = result.cycles ?? [];
    assert(cycles.length >= 1, `Has >= 1 cycle (got ${cycles.length})`);
    if (cycles.length > 0) {
      console.log(`  Cycles detected: ${cycles.map(c => c.nodeIds.join(" → ")).join(", ")}`);
    }

    // Single speaker
    const speakers = result.speakers ?? [];
    assert(speakers.length === 1, `Has exactly 1 speaker (got ${speakers.length})`);

    console.log("\n  ── Statements ──");
    result.statements.forEach(s => console.log(`    ${s.id}: ${s.text}`));
  });

  // ── Summary ────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════════`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
