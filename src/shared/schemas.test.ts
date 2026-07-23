/**
 * RED phase — effect/Schema tests for shared schemas.
 * Run: npx tsx src/shared/schemas.test.ts
 * Expected: FAILS because src/shared/schemas.ts doesn't exist yet with effect types.
 */

import { Schema } from "effect";

// We'll test the schemas once they exist in src/shared/schemas.ts
// For now, import from a path that doesn't exist — this is the RED phase
// The code below is what will run once schemas.ts is written

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

try {
  // Dynamic import — will fail until schemas.ts is written
  const mod = await import("./schemas");

  console.log("\n📋 Schema: Statement");
  {
    const valid = Schema.decodeUnknownEither(mod.StatementSchema)({
      id: "S1",
      text: "Climate change is real",
      factCheckDifficulty: 30,
      speakerId: "alice",
    });
    assert(valid._tag === "Right", "Valid statement passes");
    if (valid._tag === "Right") {
      assert(valid.right.text === "Climate change is real", "Text preserved");
      assert(valid.right.factCheckDifficulty === 30, "Score preserved");
    }
  }
  {
    // Missing optional fields
    const minimal = Schema.decodeUnknownEither(mod.StatementSchema)({
      id: "S2",
      text: "Minimal statement",
      factCheckDifficulty: 50,
    });
    assert(minimal._tag === "Right", "Statement without speakerId passes");
  }
  {
    // factCheckDifficulty out of bounds
    const tooLow = Schema.decodeUnknownEither(mod.StatementSchema)({
      id: "S3", text: "test", factCheckDifficulty: -5,
    });
    assert(tooLow._tag === "Left", "Rejects factCheckDifficulty < 0");

    const tooHigh = Schema.decodeUnknownEither(mod.StatementSchema)({
      id: "S4", text: "test", factCheckDifficulty: 150,
    });
    assert(tooHigh._tag === "Left", "Rejects factCheckDifficulty > 100");
  }
  {
    // Missing required field
    const missing = Schema.decodeUnknownEither(mod.StatementSchema)({
      text: "No id",
      factCheckDifficulty: 50,
    });
    assert(missing._tag === "Left", "Rejects missing id field");
  }

  console.log("\n📋 Schema: Speaker");
  {
    const valid = Schema.decodeUnknownEither(mod.SpeakerSchema)({
      id: "speaker_alice",
      name: "Alice",
      color: "#89b4fa",
    });
    assert(valid._tag === "Right", "Valid speaker passes");
  }
  {
    const missingColor = Schema.decodeUnknownEither(mod.SpeakerSchema)({
      id: "speaker_bob",
      name: "Bob",
    });
    assert(missingColor._tag === "Left", "Rejects speaker without color");
  }

  console.log("\n📋 Schema: Relation");
  {
    const valid = Schema.decodeUnknownEither(mod.RelationSchema)({
      from: "S1",
      to: "S2",
      type: "implication",
    });
    assert(valid._tag === "Right", "Valid relation passes");
  }
  {
    const badType = Schema.decodeUnknownEither(mod.RelationSchema)({
      from: "S1", to: "S2", type: "not_a_valid_type",
    });
    assert(badType._tag === "Left", "Rejects invalid relation type");
  }

  console.log("\n📋 Schema: AnalysisResult");
  {
    const valid = Schema.decodeUnknownEither(mod.AnalysisResultSchema)({
      statements: [{ id: "S1", text: "Hello", factCheckDifficulty: 50 }],
      relations: [],
      speakers: [{ id: "s1", name: "Speaker", color: "#fff" }],
    });
    assert(valid._tag === "Right", "Valid AnalysisResult passes");
  }
  {
    const missingStatements = Schema.decodeUnknownEither(mod.AnalysisResultSchema)({
      relations: [],
    });
    assert(missingStatements._tag === "Left", "Rejects missing statements array");
  }

  console.log("\n📋 Schema: PartialAnalysisResult");
  {
    const valid = Schema.decodeUnknownEither(mod.PartialAnalysisResultSchema)({
      statements: [{ id: "S1", text: "Partial", factCheckDifficulty: 50 }],
    });
    assert(valid._tag === "Right", "Partial with only statements passes");
  }
  {
    const empty = Schema.decodeUnknownEither(mod.PartialAnalysisResultSchema)({});
    assert(empty._tag === "Right", "Empty partial passes");
  }

  // Type extraction tests
  console.log("\n📋 Type extraction");
  {
    // Verify Schema.Schema.Type works
    type Statement = Schema.Schema.Type<typeof mod.StatementSchema>;
    const s: Statement = { id: "S1", text: "test", factCheckDifficulty: 50 };
    assert(s.id === "S1", "Type extraction compiles correctly");
  }

} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`\n❌ Test harness error: ${msg}`);
  failed++;
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) process.exit(1);
