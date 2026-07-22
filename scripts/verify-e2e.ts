/**
 * End-to-end verification script for the multi-step pipeline refactor.
 * Tests speaker detection, text chunking, buffered JSON, and type integrity.
 * No test framework — plain assertions with pass/fail logging.
 */

import { detectSpeakers } from "../src/speakerDetection";
import { chunkText, estimateTokens } from "../src/textChunking";
import { createJsonBuffer } from "../src/bufferedJsonExtractor";
import { z } from "zod";
import { StatementSchema, SpeakerSchema } from "../src/types";

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
// Test 1: Speaker Detection
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 1: Speaker Detection");

// Multi-speaker with explicit names
const multiText = `Alice: I think climate change is a serious issue.
Bob: I disagree. The evidence is not convincing.
Alice: But the scientific consensus is overwhelming.
Bob: That consensus is manufactured by grant-seeking researchers.`;

const detection = detectSpeakers(multiText);
assert(detection.speakers.length === 2, "Detects 2 speakers");
assert(detection.speakers.some((s) => s.name === "Alice"), "Finds Alice");
assert(detection.speakers.some((s) => s.name === "Bob"), "Finds Bob");
assert(detection.segments.length >= 2, "Segments text into >= 2 turns");

// Single speaker (no markers)
const singleText = "Climate change is a serious issue. We must act now.";
const singleDetect = detectSpeakers(singleText);
assert(singleDetect.speakers.length === 1, "Single speaker detected");
assert(singleDetect.speakers[0].name === "Speaker", "Default name is 'Speaker'");
assert(singleDetect.segments.length === 1, "Single segment for single speaker");

// Role-based detection
const roleText = `Interviewer: What do you think about the policy?
Guest: I believe it needs revision.`;
const roleDetect = detectSpeakers(roleText);
assert(roleDetect.speakers.length === 2, "Detects interviewer and guest");

// Non-name words filtered
const nonNameText = "However: this is not a speaker name.";
const nonNameDetect = detectSpeakers(nonNameText);
assert(nonNameDetect.speakers.length === 1, "Filters non-name words");

// Speaker color assignment
assert(
  detection.speakers.every((s) => s.color.startsWith("#")),
  "All speakers have color hex codes"
);

// ═══════════════════════════════════════════════════
// Test 2: Text Chunking
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 2: Text Chunking");

const shortText = "Hello world. This is short.";
const shortChunks = chunkText(shortText);
assert(shortChunks.length === 1, "Short text returns single chunk");
assert(shortChunks[0] === shortText, "Short chunk preserves original text");

// Generate a long text (~200 sentences)
const sentences: string[] = [];
for (let i = 0; i < 200; i++) {
  sentences.push(`This is sentence number ${i + 1} in this very long argument about climate change policy and its implications.`);
}
const longText = sentences.join(" ");
const longChunks = chunkText(longText, 1000); // ~4000 chars per chunk
assert(longChunks.length > 1, `Long text split into ${longChunks.length} chunks (>1)`);

// No chunk cuts mid-sentence
for (const chunk of longChunks) {
  assert(
    chunk.trim().endsWith(".") || chunk.includes("[Previous context:"),
    `Chunk ends with period or has context header: "...${chunk.slice(-40)}"`
  );
}

// Context preamble in non-first chunks
if (longChunks.length > 1) {
  for (let i = 1; i < longChunks.length; i++) {
    assert(
      longChunks[i].startsWith("[Previous context:"),
      `Chunk ${i + 1} has context preamble`
    );
  }
}

// Token estimation
const tokens = estimateTokens("This is a test sentence.");
assert(tokens > 0, "Token estimation returns positive number");
assert(tokens <= Math.ceil("This is a test sentence.".length / 4), "Conservative estimation");

// ═══════════════════════════════════════════════════
// Test 3: Buffered JSON Extractor
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 3: Buffered JSON Extractor");

const testObjSchema = z.object({ name: z.string(), value: z.number() });

// Single mode — complete JSON in one chunk
const buf1 = createJsonBuffer(testObjSchema, "single");
const r1 = buf1.push('{"name":"test","value":42}');
assert(r1.parsed !== null, "Parses complete JSON in single chunk");
assert(r1.parsed?.value === 42, "Parsed value is correct");

// Single mode — partial JSON returns null
const buf2 = createJsonBuffer(testObjSchema, "single");
const r2a = buf2.push('{"name":"test","val');
assert(r2a.parsed === null, "Partial JSON returns null");
const r2b = buf2.push('ue":99}');
assert(r2b.parsed !== null, "Completes parse after receiving remainder");

// Single mode — flush
const buf3 = createJsonBuffer(testObjSchema, "single");
buf3.push('{"name":"flush","value":77}');
const r3 = buf3.flush();
assert(r3.name === "flush" && r3.value === 77, "Flush returns parsed object");

// Single mode — malformed JSON throws on flush
const buf4 = createJsonBuffer(testObjSchema, "single");
buf4.push("not json at all");
assertThrows(() => buf4.flush(), "Malformed JSON throws on flush");

// Array mode — newline-delimited
const arrSchema = z.array(z.object({ id: z.number(), t: z.string() }));
const buf5 = createJsonBuffer(arrSchema, "array");
const r5a = buf5.push('{"id":1,"t":"hello"}\n');
assert(r5a.parsed !== null, "Array mode parses first line");
assert(r5a.parsed?.length === 1, "Array has 1 item");
const r5b = buf5.push('{"id":2,"t":"world"}\n');
assert(r5b.parsed !== null, "Array mode parses second line");
assert(r5b.parsed?.length === 2, "Array has 2 items");

// ═══════════════════════════════════════════════════
// Test 4: Type/Schema Integrity
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 4: Type & Schema Integrity");

// StatementSchema validates with speakerId
const validStmt = StatementSchema.safeParse({
  id: "S1",
  text: "Climate change is caused by human activity",
  factCheckDifficulty: 30,
  speakerId: "speaker_alice",
});
assert(validStmt.success, "Statement with speakerId passes validation");

// StatementSchema validates without speakerId
const noSpeakerStmt = StatementSchema.safeParse({
  id: "S2",
  text: "The sky is blue",
  factCheckDifficulty: 10,
});
assert(noSpeakerStmt.success, "Statement without speakerId passes validation");

// SpeakerSchema validation
const validSpeaker = SpeakerSchema.safeParse({
  id: "speaker_alice",
  name: "Alice",
  color: "#89b4fa",
});
assert(validSpeaker.success, "Speaker schema validates");

// factCheckDifficulty bounds
const tooLow = StatementSchema.safeParse({
  id: "S3", text: "test", factCheckDifficulty: -5,
});
assert(!tooLow.success, "Rejects factCheckDifficulty < 0");

const tooHigh = StatementSchema.safeParse({
  id: "S4", text: "test", factCheckDifficulty: 150,
});
assert(!tooHigh.success, "Rejects factCheckDifficulty > 100");

// ═══════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
