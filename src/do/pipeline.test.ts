/**
 * DO pipeline tests — unit tests for Effect pipeline logic (runs in Node.js).
 * Run: npx tsx src/do/pipeline.test.ts
 */

import { Effect, Schema } from "effect";
import { StatementSchema, AnalysisResultSchema } from "../shared/schemas";

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

// ═══════════════════════════════════════════════════
// Test 1: AI Client Service
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 1: AI Client Service");
{
  const { DeepSeekClient, makeAiClient } = await import("./ai-client");
  assert(typeof DeepSeekClient !== "undefined", "DeepSeekClient tag exists");
  assert(typeof makeAiClient === "function", "makeAiClient factory exists");

  const client = makeAiClient("test-token");
  assert(typeof client.generateText === "function", "generateText method exists");
  assert(typeof client.streamText === "function", "streamText method exists");
}

// ═══════════════════════════════════════════════════
// Test 2: Pipeline functions export correctly
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 2: Pipeline Logic Exports");
{
  const mod = await import("./pipeline-logic");
  assert(typeof mod.preprocess === "function", "preprocess exported");
  assert(typeof mod.extractStatements === "function", "extractStatements exported");
  assert(typeof mod.analyzeRelations === "function", "analyzeRelations exported");
  assert(typeof mod.scoreStatements === "function", "scoreStatements exported");
  assert(typeof mod.runFullPipeline === "function", "runFullPipeline exported");
}

// ═══════════════════════════════════════════════════
// Test 3: Preprocess step
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 3: Preprocess");
{
  const { preprocess } = await import("./pipeline-logic");

  const multiText = `Alice: Hello world.
Bob: I disagree.`;
  const result = preprocess(multiText);
  assert(result.speakers.length === 2, "Detects 2 speakers");
  assert(result.userMessage.includes("Speakers in this conversation"), "Adds speaker context");
  assert(result.userMessage.includes("Alice"), "Includes Alice in context");

  const singleText = "Just some text.";
  const singleResult = preprocess(singleText);
  assert(singleResult.speakers.length === 1, "Single speaker detected");
  assert(!singleResult.userMessage.includes("Speakers in this conversation"), "No speaker header for single speaker");
}

// ═══════════════════════════════════════════════════
// Test 4: Schema validation with simulated LLM output
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 4: Schema validation handles typical LLM outputs");
{
  // Simulate step 2 output
  const step2Output = {
    relations: [{ from: "S1", to: "S2", type: "implication", label: "implies" }],
    fallacies: [{ statementId: "S2", fallacyType: "Ad Hominem", description: "Personal attack" }],
    cycles: [],
  };

  const Step2Schema = Schema.Struct({
    relations: Schema.Array(Schema.Struct({
      from: Schema.String, to: Schema.String,
      type: Schema.Literal("implication", "conjunction", "disjunction", "supports", "contradiction", "fallacy", "restates"),
      label: Schema.optional(Schema.String),
      details: Schema.optional(Schema.String),
    })),
    fallacies: Schema.optional(Schema.Array(Schema.Struct({
      statementId: Schema.String, fallacyType: Schema.String, description: Schema.String,
    }))),
    cycles: Schema.optional(Schema.Array(Schema.Struct({
      nodeIds: Schema.Array(Schema.String), description: Schema.String,
    }))),
  });

  const decoded = Schema.decodeUnknownEither(Step2Schema)(step2Output);
  assert(decoded._tag === "Right", "Valid step 2 output passes");
  if (decoded._tag === "Right") {
    assert(decoded.right.relations.length === 1, "Relation parsed");
    assert(decoded.right.fallacies!.length === 1, "Fallacy parsed");
  }

  // Simulate step 3 output
  const step3Output = { factCheckDifficulty: 45, factCheckExplanation: "Requires scientific data" };
  const Step3Schema = Schema.Struct({
    factCheckDifficulty: Schema.Number.pipe(Schema.between(0, 100)),
    factCheckExplanation: Schema.optional(Schema.String),
  });
  const decoded3 = Schema.decodeUnknownEither(Step3Schema)(step3Output);
  assert(decoded3._tag === "Right", "Valid step 3 output passes");

  // Bad step 3
  const badStep3 = { factCheckDifficulty: 150 };
  const bad3 = Schema.decodeUnknownEither(Step3Schema)(badStep3);
  assert(bad3._tag === "Left", "OOB step 3 score rejected");
}

// ═══════════════════════════════════════════════════
// Test 5: Effect pipeline composition
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 5: Effect pipeline composition");
{
  const { runFullPipeline, preprocess } = await import("./pipeline-logic");
  const { makeAiClient, AiClientError } = await import("./ai-client");

  // Create a mock client that returns canned responses
  const mockClient = makeAiClient("mock");
  // Override with mock implementations
  const mockGenerateText = async ({ prompt }: { system: string; prompt: string }) => {
    if (prompt.includes("Statements to analyze")) {
      return JSON.stringify({
        relations: [{ from: "S1", to: "S2", type: "implication", label: "implies" }],
        fallacies: [],
        cycles: [],
      });
    }
    if (prompt.startsWith("Statement:")) {
      return JSON.stringify({ factCheckDifficulty: 30, factCheckExplanation: "Easy to verify" });
    }
    return "{}";
  };

  const mockStreamText = async function* () {
    yield '{"id":"1","text":"Climate change is real","factCheckDifficulty":30,"speakerId":"Speaker"}\n';
    yield '{"id":"2","text":"Action is needed","factCheckDifficulty":50,"speakerId":"Speaker"}\n';
  };

  const mockClientOverridden = {
    ...mockClient,
    generateText: (params: Parameters<typeof mockClient.generateText>[0]) =>
      Effect.tryPromise({
        try: () => mockGenerateText(params),
        catch: (err) => new AiClientError(String(err)),
      }),
    streamText: () => mockStreamText(),
  };

  // Run the full pipeline with mock
  const result = await Effect.runPromise(
    runFullPipeline(mockClientOverridden as any, "Climate change is real. Action is needed.")
  );

  assert(result.statements.length === 2, "Pipeline produces 2 statements");
  assert(result.statements[0].text === "Climate change is real", "First statement text correct");
  assert(result.relations.length === 1, "Pipeline produces 1 relation");
  assert(result.speakers.length >= 1, "Speakers detected");
}

// ═══════════════════════════════════════════════════
// Test 6: ID generation (Workers-compatible)
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 6: ID Generation (Workers-compatible)");
{
  function generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  const id1 = generateId();
  assert(typeof id1 === "string", "generateId returns a string");
  assert(id1.length === 36, "generateId returns UUID-length string");
  assert(id1.includes("-"), "generateId returns UUID format");

  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) ids.add(generateId());
  assert(ids.size === 100, "generateId produces unique IDs");

  // Verify fallback works even when crypto.randomUUID is missing
  // (simulate Workers runtime by testing the fallback branch directly)
  function fallbackId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  const id2 = fallbackId();
  assert(typeof id2 === "string" && id2.length === 36, "Fallback (Math.random) works");
  assert(/^[0-9a-f-]{36}$/.test(id2), "Fallback produces valid UUID format");
}

// ═══════════════════════════════════════════════════
// Test 7: Conclusion post-processor
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 7: Conclusion Post-Processor");
{
  const { postprocessConclusions } = await import("./pipeline-logic");

  const text = "All humans are mortal. Socrates is a human. Therefore, Socrates is mortal.";
  const statements = [
    { id: "S1", text: "All humans are mortal", factCheckDifficulty: 10 },
    { id: "S2", text: "Socrates is a human", factCheckDifficulty: 5 },
  ];
  const result = postprocessConclusions(text, statements);
  assert(result.length === 3, "Adds missed 'therefore' conclusion");
  assert(result[2].text === "Socrates is mortal.", "Conclusion text correct");

  const text2 = "The sky is blue. Water is wet.";
  const result2 = postprocessConclusions(text2, statements);
  assert(result2.length === 2, "No conclusions added when none present");

  const text3 = "X is true. Therefore, Y follows.";
  const stmts3 = [
    { id: "S1", text: "X is true", factCheckDifficulty: 10 },
    { id: "S2", text: "Y follows", factCheckDifficulty: 20 },
  ];
  const result3 = postprocessConclusions(text3, stmts3);
  assert(result3.length === 2, "Does not duplicate already-captured conclusions");
}

// ═══════════════════════════════════════════════════
// Test 8: Statement Verification Logic
// ═══════════════════════════════════════════════════
console.log("\n📋 Test 8: Statement Verification Logic");
{
  const { verifyStatement } = await import("./pipeline-logic");

  const mockClient = {
    generateText: (params: { system: string; prompt: string }) => {
      return Effect.succeed(
        JSON.stringify({
          verdict: "supported",
          confidence: 95,
          summary: "Web sources confirm global carbon emissions rose by 1.1% in 2023.",
        })
      );
    },
    streamText: () => {
      throw new Error("Not implemented");
    },
  };

  const mockFetch = (async () => {
    return new Response(
      JSON.stringify({
        results: [
          {
            id: "exa-1",
            url: "https://example.com/climate-report-2023",
            title: "Global Carbon Budget 2023",
            highlights: ["Global carbon emissions rose by 1.1% in 2023."],
            score: 0.98,
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const statement = {
    id: "S1",
    text: "Global carbon emissions rose by 1.1% in 2023",
    factCheckDifficulty: 30,
  };

  const factCheck = await Effect.runPromise(
    verifyStatement(mockClient, "test-exa-key", statement, mockFetch)
  );

  assert(factCheck.statementId === "S1", "Correct statementId");
  assert(factCheck.verdict === "supported", "Verdict is supported");
  assert(factCheck.confidence === 95, "Confidence score is 95%");
  assert(factCheck.sources.length === 1, "Retrieved 1 source");
  assert(factCheck.sources[0].url === "https://example.com/climate-report-2023", "Source URL correct");
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) process.exit(1);

