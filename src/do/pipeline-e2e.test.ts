/**
 * E2E test: verifies the real AI Gateway → DeepSeek streaming works
 * with the actual STEP1_EXTRACTION_PROMPT.
 * Run: npx tsx src/do/pipeline-e2e.test.ts
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText } from "ai";
import { Schema } from "effect";
import { createJsonBuffer } from "../shared/json-extractor";
import { StatementSchema } from "../shared/schemas";
import {
  STEP1_EXTRACTION_PROMPT,
  STEP2_RELATIONS_PROMPT,
  STEP3_SCORING_PROMPT,
} from "../shared/prompts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

const TOKEN = process.env.CF_AIG_TOKEN;
if (!TOKEN) {
  // Try reading from .dev.vars
  const fs = await import("fs");
  const content = fs.readFileSync(".dev.vars", "utf-8");
  const match = content.match(/CF_AIG_TOKEN=(.+)/);
  if (match) process.env.CF_AIG_TOKEN = match[1].trim();
}

const cfAigToken = process.env.CF_AIG_TOKEN;
if (!cfAigToken) {
  console.log("❌ CF_AIG_TOKEN not found in env or .dev.vars");
  process.exit(1);
}

const provider = createOpenAICompatible({
  baseURL: `https://gateway.ai.cloudflare.com/v1/ce6ed2c0c296f91487c51bff4c8133e0/fact-checker/deepseek`,
  headers: { "cf-aig-authorization": `Bearer ${cfAigToken}` },
  name: "deepseek-gateway",
});
const model = provider.chatModel("deepseek-chat");

// ═══════════════════════════════════════════════════
// Test 1: NDJSON stream parsing with token-by-token chunks
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 1: NDJSON token-by-token streaming");
{
  // Simulate realistic token-by-token stream chunks from AI SDK
  const ndjsonText =
    '{"id":"S1","text":"Climate change is real","factCheckDifficulty":30,"speakerId":"Alice"}\n' +
    '{"id":"S2","text":"Evidence is weak","factCheckDifficulty":65,"speakerId":"Bob"}\n';

  // Split into token-sized chunks (1-5 chars each) to simulate real streaming
  const chunks: string[] = [];
  let pos = 0;
  while (pos < ndjsonText.length) {
    const size = (Math.floor(Math.random() * 5) + 1);
    chunks.push(ndjsonText.slice(pos, pos + size));
    pos += size;
  }

  const buffer = createJsonBuffer<Array<{ id: string }>>(
    Schema.Array(StatementSchema),
    "array"
  );

  let lastResult: any = null;
  for (const chunk of chunks) {
    const { parsed } = buffer.push(chunk);
    if (parsed) lastResult = parsed;
  }

  assert(lastResult !== null, "Token-by-token NDJSON parses to result");
  assert(lastResult.length === 2, "Extracted 2 statements from tokenized stream");
  assert(lastResult[0].id === "S1", "First statement has correct ID");
  assert(lastResult[1].text === "Evidence is weak", "Second statement text correct");
}

// ═══════════════════════════════════════════════════
// Test 2: Markdown-fenced JSON (common LLM mistake)
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 2: Markdown-fenced JSON");
{
  const fencedOutput =
    '```json\n' +
    '{"id":"S1","text":"Climate change is real","factCheckDifficulty":30,"speakerId":"Alice"}\n' +
    '{"id":"S2","text":"Evidence is weak","factCheckDifficulty":65,"speakerId":"Bob"}\n' +
    '```\n';

  const buffer = createJsonBuffer<Array<{ id: string }>>(
    Schema.Array(StatementSchema),
    "array"
  );

  // Feed all at once (simulating accumulated stream)
  const { parsed } = buffer.push(fencedOutput);
  assert(parsed !== null, "Markdown-fenced NDJSON parses");
  if (parsed) assert(parsed.length === 2, "Extracted 2 statements from fenced output");
}

// ═══════════════════════════════════════════════════
// Test 3: JSON array instead of NDJSON (another LLM mistake)
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 3: JSON array output");
{
  const arrayOutput = JSON.stringify([
    { id: "S1", text: "Climate change is real", factCheckDifficulty: 30, speakerId: "Alice" },
    { id: "S2", text: "Evidence is weak", factCheckDifficulty: 65, speakerId: "Bob" },
  ]);

  const buffer = createJsonBuffer<Array<{ id: string }>>(
    Schema.Array(StatementSchema),
    "array"
  );

  const { parsed } = buffer.push(arrayOutput);
  assert(parsed !== null && parsed.length === 2, "JSON array parses correctly");
}

// ═══════════════════════════════════════════════════
// Test 4: Empty/malformed stream handling
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 4: Edge cases");
{
  // Empty stream
  const buf1 = createJsonBuffer(Schema.Array(StatementSchema), "array");
  try {
    buf1.flush();
    assert(false, "Should throw on empty flush"); // duplicate check below
  } catch {
    // expected behavior — flush throws if no valid data
  }

  // Only whitespace
  const buf2 = createJsonBuffer(Schema.Array(StatementSchema), "array");
  buf2.push("   \n   \n");
  try {
    buf2.flush();
    assert(false, "Should throw on whitespace-only flush");
  } catch {
    // expected
  }

  // Random text
  const buf3 = createJsonBuffer(Schema.Array(StatementSchema), "array");
  buf3.push("I am not JSON at all, just some random text.\nMore text here.\n");
  try {
    buf3.flush();
    assert(false, "Should throw on random text");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes("Failed to extract"), "Error message mentions extraction failure");
  }

  // Single valid line in otherwise invalid stream
  const buf4 = createJsonBuffer(Schema.Array(StatementSchema), "array");
  buf4.push('some garbage\n{"id":"S1","text":"Valid","factCheckDifficulty":50}\nmore garbage\n');
  const r4 = buf4.flush();
  assert(r4.length === 1, "Single valid line extracted from noisy stream");
}

// ═══════════════════════════════════════════════════
// Test 5: Real AI Gateway — Step 1 statement extraction
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 5: Real AI Gateway — Step 1 extraction (streaming)");
{
  const sampleText = `Alice: Climate change is a serious threat that requires immediate action.
Bob: I disagree. The scientific evidence for human-caused climate change is not convincing.
Alice: Actually, 97% of climate scientists agree that humans are causing global warming.
Bob: That statistic is manufactured by researchers who depend on government grants.`;

  try {
    const { textStream } = streamText({
      model,
      system: STEP1_EXTRACTION_PROMPT,
      prompt: sampleText,
      maxTokens: 2000,
    });

    const buffer = createJsonBuffer<Array<{ id: string; text: string; factCheckDifficulty: number; speakerId?: string }>>(
      Schema.Array(StatementSchema),
      "array"
    );

    let full = "";
    let lastCount = 0;
    let statements: any[] = [];

    for await (const chunk of textStream) {
      full += chunk;
      const { parsed } = buffer.push(chunk);
      if (parsed && parsed.length > lastCount) {
        statements = parsed;
        lastCount = parsed.length;
      }
    }

    // Final flush
    try {
      const final = buffer.flush();
      statements = final;
    } catch {
      // Already got what we could
    }

    console.log(`    Raw output (${full.length} chars):`);
    console.log(`    ${full.slice(0, 200)}...`);

    assert(statements.length >= 2, `Extracted ${statements.length} statements (>= 2)`);
    assert(
      statements.some((s: any) => s.text.toLowerCase().includes("climate")),
      "Statements include climate-related claim"
    );
    assert(
      statements.every((s: any) => typeof s.id === "string" && s.id.startsWith("S")),
      "All statements have valid IDs"
    );
    assert(
      statements.every((s: any) => typeof s.factCheckDifficulty === "number"),
      "All statements have difficulty scores"
    );

    console.log("    Extracted statements:");
    for (const s of statements) {
      console.log(`      [${s.id}] (${s.speakerId ?? "unknown"}): ${s.text.slice(0, 60)}...`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ Real API call failed: ${msg}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════
// Test 6: Real AI Gateway — Step 2 relations
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 6: Real AI Gateway — Step 2 relations");
{
  const stmtList = [
    "[S1] (Alice): Climate change is a serious threat.",
    "[S2] (Bob): Scientific evidence is not convincing.",
    "[S3] (Alice): 97% of scientists agree on human-caused warming.",
    "[S4] (Bob): The consensus is manufactured for grants.",
  ].join("\n");

  try {
    const { text } = await generateText({
      model,
      system: STEP2_RELATIONS_PROMPT,
      prompt: `Statements to analyze:\n\n${stmtList}`,
      maxTokens: 2000,
    });

    console.log(`    Raw output: ${text.slice(0, 200)}...`);

    // Try to parse
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) json = JSON.parse(fenceMatch[1].trim());
      else {
        const braceMatch = text.match(/\{[\s\S]*\}/);
        if (braceMatch) json = JSON.parse(braceMatch[0].trim());
      }
    }

    assert(json !== undefined, "Step 2 output is parsable JSON");
    assert(Array.isArray(json.relations), "Has relations array");
    assert(json.relations.length >= 1, `Found ${json.relations.length} relations (>= 1)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ Step 2 failed: ${msg}`);
    failed++;
  }
}

// ═══════════════════════════════════════════════════
// Test 7: Real AI Gateway — Step 3 scoring
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 7: Real AI Gateway — Step 3 scoring");
{
  try {
    const { text } = await generateText({
      model,
      system: STEP3_SCORING_PROMPT,
      prompt: `Statement: "Climate change is a serious threat that requires immediate action."`,
      maxTokens: 256,
    });

    let json: any;
    try { json = JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) json = JSON.parse(m[0]);
    }

    assert(json !== undefined, "Step 3 output is parsable JSON");
    assert(typeof json.factCheckDifficulty === "number", "Has numeric difficulty score");
    assert(json.factCheckDifficulty >= 0 && json.factCheckDifficulty <= 100, "Score in 0-100 range");
    console.log(`    Score: ${json.factCheckDifficulty} — ${json.factCheckExplanation}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ Step 3 failed: ${msg}`);
    failed++;
  }
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) process.exit(1);
