/**
 * RED phase — tests for shared utilities.
 * Run: npx tsx src/shared/utilities.test.ts
 * Tests: prompts, speaker detection, text chunking, JSON extractor
 */

import { detectSpeakers } from "./speaker-detection";
import { chunkText, estimateTokens } from "./text-chunking";
import { createJsonBuffer } from "./json-extractor";
import { generateId } from "./id-generator";
import { Schema } from "effect";
import { StatementSchema } from "./schemas";

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

function assertThrows(fn: () => void, name: string): void {
  try {
    fn();
    console.log(`  ❌ ${name} — expected error but none thrown`);
    failed++;
  } catch {
    console.log(`  ✅ ${name}`);
    passed++;
  }
}

// ═══════════════════════════════════════════════════
// Test 1: Prompts
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 1: Prompts");
import { STEP1_EXTRACTION_PROMPT, STEP2_RELATIONS_PROMPT, STEP3_SCORING_PROMPT, SYSTEM_PROMPT } from "./prompts";
assert(typeof STEP1_EXTRACTION_PROMPT === "string" && STEP1_EXTRACTION_PROMPT.length > 100, "Step 1 prompt exists");
assert(typeof STEP2_RELATIONS_PROMPT === "string" && STEP2_RELATIONS_PROMPT.length > 100, "Step 2 prompt exists");
assert(typeof STEP3_SCORING_PROMPT === "string" && STEP3_SCORING_PROMPT.length > 100, "Step 3 prompt exists");
assert(typeof SYSTEM_PROMPT === "string" && SYSTEM_PROMPT.length > 100, "Legacy prompt exists");
assert(STEP1_EXTRACTION_PROMPT.includes("atomic"), "Step 1 prompt includes 'atomic'");
assert(STEP2_RELATIONS_PROMPT.includes("relations"), "Step 2 prompt includes 'relations'");

// ═══════════════════════════════════════════════════
// Test 2: Speaker Detection
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 2: Speaker Detection");

const multiText = `Alice: I think climate change is a serious issue.
Bob: I disagree. The evidence is not convincing.
Alice: But the scientific consensus is overwhelming.
Bob: That consensus is manufactured by grant-seeking researchers.`;

const detection = detectSpeakers(multiText);
assert(detection.speakers.length === 2, "Detects 2 speakers");
assert(detection.speakers.some((s) => s.name === "Alice"), "Finds Alice");
assert(detection.speakers.some((s) => s.name === "Bob"), "Finds Bob");
assert(detection.segments.length >= 2, "Segments text into >= 2 turns");

const singleText = "Climate change is a serious issue. We must act now.";
const singleDetect = detectSpeakers(singleText);
assert(singleDetect.speakers.length === 1, "Single speaker detected");
assert(singleDetect.speakers[0].name === "Speaker", "Default name is 'Speaker'");
assert(singleDetect.segments.length === 1, "Single segment for single speaker");

const roleText = `Interviewer: What do you think about the policy?
Guest: I believe it needs revision.`;
const roleDetect = detectSpeakers(roleText);
assert(roleDetect.speakers.length === 2, "Detects interviewer and guest");

const nonNameText = "However: this is not a speaker name.";
const nonNameDetect = detectSpeakers(nonNameText);
assert(nonNameDetect.speakers.length === 1, "Filters non-name words");

assert(detection.speakers.every((s) => s.color.startsWith("#")), "All speakers have color hex codes");

// ═══════════════════════════════════════════════════
// Test 3: Text Chunking
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 3: Text Chunking");

const shortText = "Hello world. This is short.";
const shortChunks = chunkText(shortText);
assert(shortChunks.length === 1, "Short text returns single chunk");
assert(shortChunks[0] === shortText, "Short chunk preserves original text");

const sentences: string[] = [];
for (let i = 0; i < 200; i++) {
  sentences.push(`This is sentence number ${i + 1} in this very long argument about climate change policy and its implications.`);
}
const longText = sentences.join(" ");
const longChunks = chunkText(longText, 1000);
assert(longChunks.length > 1, `Long text split into ${longChunks.length} chunks (>1)`);

for (const chunk of longChunks) {
  assert(
    chunk.trim().endsWith(".") || chunk.includes("[Previous context:"),
    `Chunk ends with period or has context header: "...${chunk.slice(-40)}"`
  );
}

if (longChunks.length > 1) {
  for (let i = 1; i < longChunks.length; i++) {
    assert(longChunks[i].startsWith("[Previous context:"), `Chunk ${i + 1} has context preamble`);
  }
}

const tokens = estimateTokens("This is a test sentence.");
assert(tokens > 0, "Token estimation returns positive number");
assert(tokens <= Math.ceil("This is a test sentence.".length / 4), "Conservative estimation");

// ═══════════════════════════════════════════════════
// Test 4: JSON Extractor (ported from bufferedJsonExtractor)
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 4: JSON Extractor");

const testSchema = Schema.Struct({ name: Schema.String, value: Schema.Number });

// Single mode — complete JSON in one chunk
const buf1 = createJsonBuffer(testSchema, "single");
const r1 = buf1.push('{"name":"test","value":42}');
assert(r1.parsed !== null, "Parses complete JSON in single chunk");
assert(r1.parsed?.value === 42, "Parsed value is correct");

// Single mode — partial JSON returns null
const buf2 = createJsonBuffer(testSchema, "single");
const r2a = buf2.push('{"name":"test","val');
assert(r2a.parsed === null, "Partial JSON returns null");
const r2b = buf2.push('ue":99}');
assert(r2b.parsed !== null, "Completes parse after receiving remainder");

// Single mode — flush
const buf3 = createJsonBuffer(testSchema, "single");
buf3.push('{"name":"flush","value":77}');
const r3 = buf3.flush();
assert(r3.name === "flush" && r3.value === 77, "Flush returns parsed object");

// Single mode — malformed JSON throws on flush
const buf4 = createJsonBuffer(testSchema, "single");
buf4.push("not json at all");
assertThrows(() => buf4.flush(), "Malformed JSON throws on flush");

// Array mode — newline-delimited (NDJSON)
const arrSchema = Schema.Array(Schema.Struct({ id: Schema.Number, t: Schema.String }));
const buf5 = createJsonBuffer(arrSchema, "array");
const r5a = buf5.push('{"id":1,"t":"hello"}\n');
assert(r5a.parsed !== null, "Array mode parses first line");
assert(r5a.parsed?.length === 1, "Array has 1 item");
const r5b = buf5.push('{"id":2,"t":"world"}\n');
assert(r5b.parsed !== null, "Array mode parses second line");
assert(r5b.parsed?.length === 2, "Array has 2 items");

// ═══════════════════════════════════════════════════
// Test 5: ID Generator (Workers-compatible)
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 5: ID Generator");
{
  const id = generateId();
  assert(typeof id === "string", "Returns a string");
  assert(id.length === 36, "Returns 36-character UUID");
  assert(id.includes("-"), "Contains dashes");

  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) ids.add(generateId());
  assert(ids.size === 100, "Produces 100 unique IDs");

  // Verify format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert(uuidRegex.test(id), "Matches UUID v4 format");
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) process.exit(1);
