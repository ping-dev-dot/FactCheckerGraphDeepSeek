/**
 * Pipeline Logic — Effect-based step orchestrators for the analysis pipeline.
 * These functions are pure Effect and can be tested in Node.js.
 * The DO class (pipeline.ts) wires these together with env bindings.
 */

import { Effect, Schema } from "effect";
import { StatementSchema, FactCheckSynthesisSchema } from "../shared/schemas";
import { detectSpeakers } from "../shared/speaker-detection";
import { createJsonBuffer, extractJson } from "../shared/json-extractor";
import {
  STEP1_EXTRACTION_PROMPT,
  STEP2_RELATIONS_PROMPT,
  STEP3_SCORING_PROMPT,
  STEP4_VERIFICATION_PROMPT,
} from "../shared/prompts";
import type { AiClientShape } from "./ai-client";
import { searchExa } from "./exa-client";
import type { StatementFactCheck, FactCheckVerdict } from "../shared/types";

// ── Schemas for LLM output ──

const Step2OutputSchema = Schema.Struct({
  relations: Schema.Array(
    Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      type: Schema.Literal(
        "implication", "conjunction", "disjunction",
        "supports", "contradiction", "fallacy", "restates"
      ),
      label: Schema.optional(Schema.String),
      details: Schema.optional(Schema.String),
    })
  ),
  fallacies: Schema.optional(
    Schema.Array(
      Schema.Struct({
        statementId: Schema.String,
        fallacyType: Schema.String,
        description: Schema.String,
      })
    )
  ),
  cycles: Schema.optional(
    Schema.Array(
      Schema.Struct({
        nodeIds: Schema.Array(Schema.String),
        description: Schema.String,
      })
    )
  ),
});

const Step3OutputSchema = Schema.Struct({
  factCheckDifficulty: Schema.Number.pipe(Schema.between(0, 100)),
  factCheckExplanation: Schema.optional(Schema.String),
});

// ── Types ──

export interface Statement {
  id: string;
  text: string;
  factCheckDifficulty: number;
  factCheckExplanation?: string;
  speakerId?: string;
}

export interface AnalysisOutput {
  statements: Statement[];
  relations: Array<{
    from: string; to: string;
    type: "implication" | "conjunction" | "disjunction" | "supports" | "contradiction" | "fallacy" | "restates";
    label?: string; details?: string;
  }>;
  fallacies?: Array<{ statementId: string; fallacyType: string; description: string }>;
  cycles?: Array<{ nodeIds: string[]; description: string }>;
  speakers: Array<{ id: string; name: string; color: string }>;
}

// ── Helpers ──

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ } }
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) { try { return JSON.parse(braceMatch[0].trim()); } catch { /* fall through */ } }
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0].trim()); } catch { /* fall through */ } }
  throw new Error("Failed to extract JSON from response");
}

// ── Step 0: Preprocess ──

export function preprocess(text: string) {
  const detection = detectSpeakers(text);
  let userMessage = text;
  if (detection.speakers.length > 1) {
    userMessage = `Speakers in this conversation:\n${
      detection.speakers.map((s) => `${s.id}: ${s.name}`).join("\n")
    }\n\nText to analyze:\n${text}`;
  }
  return { speakers: detection.speakers, userMessage };
}

// ── Step 1: Extract Statements (streaming) ──

export function extractStatements(
  client: AiClientShape,
  userMessage: string,
  onStatements?: (stmts: Statement[]) => void
): Effect.Effect<Statement[], Error> {
  return Effect.tryPromise({
    try: async () => {
      const jsonBuffer = createJsonBuffer<Statement[]>(
        Schema.Array(StatementSchema),
        "array"
      );

      const stream = client.streamText({
        system: STEP1_EXTRACTION_PROMPT,
        prompt: userMessage,
        maxTokens: 4096,
      });

      let lastCount = 0;
      let statements: Statement[] = [];

      for await (const delta of stream) {
        const { parsed } = jsonBuffer.push(delta);
        if (parsed && parsed.length > lastCount) {
          const newOnes = parsed.slice(lastCount);
          statements = [...statements, ...newOnes.map((s, i) => ({
            ...s,
            id: `S${statements.length + i + 1}`,
          }))];
          lastCount = parsed.length;
          onStatements?.([...statements]);
        }
      }

      // Flush remaining
      const final = jsonBuffer.flush();
      if (final.length > lastCount) {
        const newOnes = final.slice(lastCount);
        statements = [...statements, ...newOnes.map((s, i) => ({
          ...s,
          id: `S${statements.length + i + 1}`,
        }))];
        onStatements?.([...statements]);
      }

      return statements;
    },
    catch: (err) => new Error(
      `Statement extraction failed: ${err instanceof Error ? err.message : String(err)}`
    ),
  });
}

// ── Step 2: Analyze Relations ──

export function analyzeRelations(
  client: AiClientShape,
  statements: Statement[]
): Effect.Effect<{
  relations: Schema.Schema.Type<typeof Step2OutputSchema>["relations"];
  fallacies: NonNullable<Schema.Schema.Type<typeof Step2OutputSchema>["fallacies"]>;
  cycles: NonNullable<Schema.Schema.Type<typeof Step2OutputSchema>["cycles"]>;
}, Error> {
  return Effect.gen(function* () {
    const stmtList = statements
      .map((s) => `[${s.id}] (${s.speakerId ?? "unknown"}): ${s.text}`)
      .join("\n");

    const raw = yield* client.generateText({
      system: STEP2_RELATIONS_PROMPT,
      prompt: `Statements to analyze:\n\n${stmtList}`,
      maxTokens: 4096,
    });

    const json = extractJson(raw);
    const decoded = Schema.decodeUnknownEither(Step2OutputSchema)(json);

    if (decoded._tag === "Left") {
      return { relations: [], fallacies: [], cycles: [] };
    }

    return {
      relations: decoded.right.relations,
      fallacies: decoded.right.fallacies ?? [],
      cycles: decoded.right.cycles ?? [],
    };
  });
}

// ── Step 3: Score Statements (parallel) ──

export function scoreStatements(
  client: AiClientShape,
  statements: Statement[]
): Effect.Effect<Statement[], Error> {
  return Effect.gen(function* () {
    const unscored = statements.filter(
      (s) => s.factCheckDifficulty === 50
    );

    if (unscored.length === 0) return statements;

    const scores = yield* Effect.forEach(
      unscored,
      (stmt) =>
        Effect.gen(function* () {
          const raw = yield* client.generateText({
            system: STEP3_SCORING_PROMPT,
            prompt: `Statement: "${stmt.text}"`,
            maxTokens: 256,
          });
          const json = extractJson(raw);
          const decoded = Schema.decodeUnknownEither(Step3OutputSchema)(json);
          if (decoded._tag === "Right") {
            return {
              id: stmt.id,
              factCheckDifficulty: decoded.right.factCheckDifficulty,
              factCheckExplanation: decoded.right.factCheckExplanation,
            };
          }
          return { id: stmt.id, factCheckDifficulty: 50 };
        }),
      { concurrency: "unbounded" }
    );

    // Apply scores
    return statements.map((s) => {
      const score = scores.find((sc) => sc.id === s.id);
      return score ? { ...s, factCheckDifficulty: score.factCheckDifficulty, factCheckExplanation: score.factCheckExplanation } : s;
    });
  });
}

// ── Post-processing: capture missed conclusion claims ──

/**
 * Scan the original text for conclusion markers ("therefore", "thus", "so", etc.)
 * that the model may have skipped as "implied". Returns additional statements.
 */
export function postprocessConclusions(
  text: string,
  statements: Statement[]
): Statement[] {
  const conclusionMarkers = /(?:^|[.?!]\s+|\n)(Therefore|Thus|Hence|So|Consequently|It follows that|This means that)\b[,:]?\s*/gim;
  const existingTexts = new Set(
    statements.map((s) => s.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim())
  );
  let result = [...statements];
  let match;
  while ((match = conclusionMarkers.exec(text)) !== null) {
    const afterMarker = text.slice(match.index + match[0].length);
    const sentenceMatch = afterMarker.match(/^([^.?!]+[.?!]?)/);
    if (sentenceMatch) {
      const conclusionText = sentenceMatch[1].trim();
      if (conclusionText.length > 15) {
        const normalized = conclusionText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const isDuplicate = [...existingTexts].some(
          (et) => et.includes(normalized) || normalized.includes(et)
        );
        if (!isDuplicate) {
          const newId = `S${result.length + 1}`;
          result = [
            ...result,
            {
              id: newId,
              text: conclusionText,
              factCheckDifficulty: 50,
              speakerId: result[0]?.speakerId ?? "Speaker",
            },
          ];
          existingTexts.add(normalized);
        }
      }
    }
  }
  return result;
}

// ── Full Pipeline ──

export function runFullPipeline(
  client: AiClientShape,
  text: string
): Effect.Effect<AnalysisOutput, Error> {
  return Effect.gen(function* () {
    // Step 0: Preprocess
    const { speakers, userMessage } = preprocess(text);

    // Step 1: Extract statements
    const rawStatements = yield* extractStatements(client, userMessage);

    // ── Post-processing: capture missed conclusion claims ──
    const statements = postprocessConclusions(text, rawStatements);

    // Step 2: Analyze relations
    const { relations, fallacies, cycles } = yield* analyzeRelations(client, statements);

    // Step 3: Score difficulty
    const scored = yield* scoreStatements(client, statements);

    return { statements: scored, relations, fallacies, cycles, speakers };
  });
}

// ── Step 4: Verify Statement with Exa + DeepSeek ──

export function verifyStatement(
  client: AiClientShape,
  exaApiKey: string,
  statement: Statement,
  fetchFn?: typeof fetch
): Effect.Effect<StatementFactCheck, Error> {
  return Effect.gen(function* () {
    // 1. Fetch web search evidence via Exa
    const sources = yield* searchExa(exaApiKey, statement.text, 5, fetchFn);

    if (sources.length === 0) {
      return {
        statementId: statement.id,
        verdict: "inconclusive" as const,
        confidence: 0,
        summary: "No relevant web evidence could be retrieved for this statement.",
        sources: [],
        verifiedAt: new Date().toISOString(),
      };
    }

    // 2. Format evidence for synthesis prompt
    const evidenceText = sources
      .map(
        (src, idx) =>
          `[Source ${idx + 1}] Title: "${src.title}"\nURL: ${src.url}\nSnippet: "${src.snippet}"`
      )
      .join("\n\n");

    const prompt = `Proposition Statement: "${statement.text}"\n\nWeb Evidence Snippets:\n${evidenceText}`;

    // 3. Call LLM to synthesize verdict
    const raw = yield* client.generateText({
      system: STEP4_VERIFICATION_PROMPT,
      prompt,
      maxTokens: 512,
    });

    const json = extractJson(raw);
    const decoded = Schema.decodeUnknownEither(FactCheckSynthesisSchema)(json);

    let verdict: FactCheckVerdict = "inconclusive";
    let confidence = 50;
    let summary = "Evidence was retrieved, but synthesis returned an ambiguous result.";

    if (decoded._tag === "Right") {
      verdict = decoded.right.verdict as FactCheckVerdict;
      confidence = decoded.right.confidence;
      summary = decoded.right.summary;
    }

    return {
      statementId: statement.id,
      verdict,
      confidence,
      summary,
      sources,
      verifiedAt: new Date().toISOString(),
    };
  });
}

