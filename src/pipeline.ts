/**
 * Multi-step analysis pipeline orchestrator.
 * Preprocess → Extract statements (streaming) → Analyze relations → Score facts.
 * Each step can fail independently; partial results are surfaced.
 */

import { z } from "zod";
import type {
  AnalysisResult,
  PartialAnalysisResult,
  PipelineProgress,
  Statement,
  Speaker,
  FactCheckSourceEval,
  FactCheckVerdict,
  FactCheckProgress,
} from "./types";
import {
  AnalysisResultSchema,
  PipelineStepError,
} from "./types";
import { detectSpeakers } from "./speakerDetection";
import { chunkText, estimateTokens } from "./textChunking";
import { streamChatCompletion, chatCompletion } from "./streaming";
import { createJsonBuffer } from "./bufferedJsonExtractor";
import {
  STEP1_EXTRACTION_PROMPT,
  STEP2_RELATIONS_PROMPT,
  STEP3_SCORING_PROMPT,
} from "./prompts";
import { runFactCheck } from "./factCheck";

const MODEL = "deepseek-chat";

// Schema for step 1 output: array of statement objects
const StatementArraySchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    factCheckDifficulty: z.number().min(0).max(100).default(50),
    factCheckExplanation: z.string().optional(),
    speakerId: z.string().optional(),
  })
);

// Schema for step 2 output
const Step2OutputSchema = z.object({
  relations: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum([
          "implication",
          "conjunction",
          "disjunction",
          "supports",
          "contradiction",
          "fallacy",
          "restates",
        ]),
        label: z.string().optional(),
        details: z.string().optional(),
      })
    )
    .default([]),
  fallacies: z
    .array(
      z.object({
        statementId: z.string(),
        fallacyType: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  cycles: z
    .array(
      z.object({ nodeIds: z.array(z.string()), description: z.string() })
    )
    .optional(),
});

// Schema for step 3 output
const Step3OutputSchema = z.object({
  factCheckDifficulty: z.number().min(0).max(100),
  factCheckExplanation: z.string().optional(),
});

function emitProgress(
  onProgress: (p: PipelineProgress) => void,
  stage: PipelineProgress["stage"],
  message: string,
  statementsFound: number,
  currentStep: number,
  totalSteps: number
) {
  onProgress({ stage, message, statementsFound, totalSteps, currentStep });
}

/**
 * Run the full analysis pipeline.
 *
 * @param text - The argument text to analyze
 * @param apiKey - DeepSeek API key
 * @param onProgress - Called at each stage transition
 * @param onStatements - Called when new statements are extracted (streaming)
 * @param onPartialResult - Called when partial results are available
 * @returns The complete AnalysisResult
 */
export async function runAnalysisPipeline(
  text: string,
  apiKey: string,
  onProgress: (progress: PipelineProgress) => void,
  onStatements: (statements: Statement[]) => void,
  onPartialResult: (result: PartialAnalysisResult) => void,
  braveApiKey?: string,
  onFactCheckProgress?: (progress: FactCheckProgress) => void,
  onStatementFactChecked?: (
    statementId: string,
    sources: FactCheckSourceEval[],
    verdict: FactCheckVerdict | null
  ) => void
): Promise<AnalysisResult> {
  if (!apiKey.trim()) throw new Error("API key is required.");
  if (!text.trim()) throw new Error("Argument text is required.");

  const hasFactCheck = !!braveApiKey?.trim();
  const totalSteps = hasFactCheck ? 4 : 3;
  let extractedStatements: Statement[] = [];
  let speakers: Speaker[] = [];

  // ── Step 0: Preprocessing ──
  emitProgress(onProgress, "preprocessing", "Detecting speakers...", 0, 0, totalSteps);

  const detection = detectSpeakers(text);
  speakers = detection.speakers;

  // Build user message with speaker context
  let userMessage = text;
  if (speakers.length > 1) {
    userMessage = `Speakers in this conversation:\n${
      speakers.map((s) => `- ${s.id}: ${s.name}`).join("\n")
    }\n\nText to analyze:\n${text}`;
  }

  // Check if chunking is needed (for very long texts)
  const chunks = chunkText(userMessage);
  if (chunks.length > 1) {
    emitProgress(
      onProgress,
      "preprocessing",
      `Text chunked into ${chunks.length} parts (${estimateTokens(text)} tokens)`,
      0, 0, totalSteps
    );
  }

  // ── Step 1: Statement Extraction (streaming) ──
  emitProgress(onProgress, "extracting", "Extracting statements...", 0, 1, totalSteps);

  let step1Failed = false;

  // Process chunks sequentially, merging results
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const jsonBuffer = createJsonBuffer<Statement[]>(StatementArraySchema, "array");

    try {
      const stream = streamChatCompletion({
        apiKey,
        model: MODEL,
        systemPrompt: STEP1_EXTRACTION_PROMPT,
        userMessage: chunk,
        maxTokens: 4096,
      });

      let lastStatements: Statement[] = [];
      for await (const delta of stream) {
        const { parsed } = jsonBuffer.push(delta);
        if (parsed && parsed.length > lastStatements.length) {
          // Merge chunk results with main statement list
          // Re-index to avoid ID collisions across chunks
          const startIdx = extractedStatements.length;
          const newStatements = parsed.slice(lastStatements.length).map((s, i) => ({
            ...s,
            id: `S${startIdx + i + 1}`,
          }));
          extractedStatements = [...extractedStatements, ...newStatements];
          lastStatements = parsed;
          onStatements([...extractedStatements]);
          emitProgress(
            onProgress,
            "extracting",
            `Extracting statements...`,
            extractedStatements.length,
            1,
            totalSteps
          );
        }
      }

      // Flush remaining
      const final = jsonBuffer.flush();
      if (final.length > lastStatements.length) {
        const startIdx = extractedStatements.length;
        const newStatements = final.slice(lastStatements.length).map((s, i) => ({
          ...s,
          id: `S${startIdx + i + 1}`,
        }));
        extractedStatements = [...extractedStatements, ...newStatements];
        onStatements([...extractedStatements]);
      }
    } catch (err) {
      if (chunks.length > 1) {
        // Continue with next chunk
        console.warn(`Chunk ${ci + 1} failed:`, err);
        continue;
      }
      step1Failed = true;
      break;
    }
  }

  if (step1Failed || extractedStatements.length === 0) {
    throw new Error(
      "Failed to extract any statements. The model may not have understood the input."
    );
  }

  // ── Post-processing: capture missed conclusion claims ──
  // Models sometimes skip "therefore/thus/so" conclusions as "implied".
  // We scan for conclusion markers at sentence boundaries and add any missing claims.
  const conclusionMarkers = /(?:^|[.?!]\s+|\n)(Therefore|Thus|Hence|So|Consequently|It follows that|This means that)\b[,:]?\s*/gim;
  let match;
  const existingTexts = new Set(
    extractedStatements.map((s) => s.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim())
  );
  while ((match = conclusionMarkers.exec(text)) !== null) {
    const afterMarker = text.slice(match.index + match[0].length);
    // Take the sentence that follows the marker
    const sentenceMatch = afterMarker.match(/^([^.?!]+[.?!]?)/);
    if (sentenceMatch) {
      const conclusionText = sentenceMatch[1].trim();
      if (conclusionText.length > 15) {
        const normalized = conclusionText.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        // Check if this claim is already covered by an existing statement
        const isDuplicate = [...existingTexts].some(
          (et) => et.includes(normalized) || normalized.includes(et)
        );
        if (!isDuplicate) {
          const newId = `S${extractedStatements.length + 1}`;
          extractedStatements = [
            ...extractedStatements,
            {
              id: newId,
              text: conclusionText,
              factCheckDifficulty: 50,
              speakerId: extractedStatements[0]?.speakerId ?? "Speaker",
            },
          ];
          existingTexts.add(normalized);
          onStatements([...extractedStatements]);
        }
      }
    }
  }

  // ── Step 2: Relation & Fallacy Analysis (streaming for live feedback) ──
  emitProgress(
    onProgress,
    "analyzing_relations",
    "Analyzing logical relationships...",
    extractedStatements.length,
    2,
    totalSteps
  );

  let relationsResult: z.infer<typeof Step2OutputSchema> = {
    relations: [],
    fallacies: [],
    cycles: [],
  };
  let step2Succeeded = true;

  try {
    // Pass exact statement list to step 2 so IDs are consistent
    const stmtList = extractedStatements
      .map((s) => `[${s.id}] (${s.speakerId ?? "unknown"}): ${s.text}`)
      .join("\n");

    // Stream step 2 to show live relation/fallacy/cycle counts
    const step2JsonBuffer = createJsonBuffer<z.infer<typeof Step2OutputSchema>>(
      Step2OutputSchema,
      "single"
    );

    let lastRelCount = 0;
    let lastFalCount = 0;
    let lastCycCount = 0;

    const step2Stream = streamChatCompletion({
      apiKey,
      model: MODEL,
      systemPrompt: STEP2_RELATIONS_PROMPT,
      userMessage: `Statements to analyze:\n\n${stmtList}`,
      maxTokens: 4096,
    });

    let didParse = false;
    for await (const delta of step2Stream) {
      const { parsed } = step2JsonBuffer.push(delta);

      // Count partial results from the raw buffer for live feedback
      const raw = step2JsonBuffer.getBuffer?.() ?? "";
      const relCount = (raw.match(/"from":\s*"/g) ?? []).length;
      const falCount = (raw.match(/"statementId":\s*"/g) ?? []).length;
      const cycCount = (raw.match(/"nodeIds":\s*\[/g) ?? []).length;

      if (relCount > lastRelCount || falCount > lastFalCount || cycCount > lastCycCount) {
        lastRelCount = relCount;
        lastFalCount = falCount;
        lastCycCount = cycCount;
        const parts: string[] = [];
        if (relCount > 0) parts.push(`${relCount} relations`);
        if (falCount > 0) parts.push(`${falCount} fallacies`);
        if (cycCount > 0) parts.push(`${cycCount} cycles`);
        emitProgress(
          onProgress,
          "analyzing_relations",
          `Linking: ${parts.join(", ") || "analyzing..."}`,
          extractedStatements.length,
          2,
          totalSteps
        );

        // Try to extract partial relations/fallacies/cycles for live graph updates
        const partialRel = extractPartialRelations(raw);
        const partialFal = extractPartialFallacies(raw);
        const partialCyc = extractPartialCycles(raw);
        if (partialRel.length > 0 || partialFal.length > 0 || partialCyc.length > 0) {
          onPartialResult({
            statements: extractedStatements,
            relations: partialRel,
            fallacies: partialFal,
            cycles: partialCyc,
            speakers,
          });
        }
      }

      if (parsed) {
        relationsResult = parsed;
        didParse = true;
        break; // Got the full result, stop streaming
      }
    }

    // If streaming never yielded a complete parse, flush
    if (!didParse) {
      relationsResult = step2JsonBuffer.flush();
    }
  } catch (err) {
    step2Succeeded = false;
    // Surface partial result with just statements
    const partial: PartialAnalysisResult = {
      statements: extractedStatements,
      speakers,
    };
    onPartialResult(partial);
    throw new PipelineStepError(
      `Relation analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      "analyzing_relations",
      partial
    );
  }

  // ── Step 3: Fact-Check Scoring (batched) ──
  emitProgress(
    onProgress,
    "scoring",
    "Scoring fact-check difficulty...",
    extractedStatements.length,
    3,
    totalSteps
  );

  // Score statements that lack difficulty scores
  const unscored = extractedStatements.filter(
    (s) => s.factCheckDifficulty === undefined || s.factCheckDifficulty === 50
  );

  if (unscored.length > 0) {
    // Batch process: score 5 at a time
    const batchSize = 5;
    for (let i = 0; i < unscored.length; i += batchSize) {
      const batch = unscored.slice(i, i + batchSize);
      try {
        const scores = await Promise.all(
          batch.map(async (stmt) => {
            const resp = await chatCompletion({
              apiKey,
              model: MODEL,
              systemPrompt: STEP3_SCORING_PROMPT,
              userMessage: `Statement: "${stmt.text}"`,
              maxTokens: 256,
            });
            const parsed = Step3OutputSchema.parse(extractJson(resp));
            return { id: stmt.id, ...parsed };
          })
        );

        // Update statements with scores
        for (const score of scores) {
          const stmt = extractedStatements.find((s) => s.id === score.id);
          if (stmt) {
            stmt.factCheckDifficulty = score.factCheckDifficulty;
            stmt.factCheckExplanation = score.factCheckExplanation;
          }
        }

        // Notify of partial update during scoring
        const partial: PartialAnalysisResult = {
          statements: extractedStatements,
          relations: step2Succeeded ? relationsResult.relations : [],
          fallacies: step2Succeeded ? relationsResult.fallacies : [],
          cycles: step2Succeeded ? relationsResult.cycles : [],
          speakers,
        };
        onPartialResult(partial);
        emitProgress(
          onProgress,
          "scoring",
          `Scoring fact-check difficulty... (${Math.min(i + batchSize, unscored.length)}/${unscored.length})`,
          extractedStatements.length,
          3,
          totalSteps
        );
      } catch {
        // Scoring failure is non-fatal — keep default scores
      }
    }
  }

  // ── Step 4 (optional): Fact-checking via Brave LLM Context API ──
  if (hasFactCheck && onFactCheckProgress && onStatementFactChecked && braveApiKey) {
    emitProgress(
      onProgress,
      "fact_checking",
      "Fact-checking statements against web sources...",
      extractedStatements.length,
      4,
      totalSteps
    );

    try {
      await runFactCheck(
        extractedStatements,
        text,
        apiKey,
        braveApiKey,
        {
          onProgress: onFactCheckProgress,
          onStatementUpdate: (stmtId, sources, verdict) => {
            // Merge into statements in-place
            const stmt = extractedStatements.find((s) => s.id === stmtId);
            if (stmt) {
              (stmt as any).factCheckSources = sources;
              (stmt as any).factCheckResult = verdict ?? undefined;
            }
            onStatementFactChecked!(stmtId, sources, verdict);
          },
        }
      );
    } catch {
      // Fact-checking failure is non-fatal — continue with whatever we have
    }
  }

  // ── Build final result ──
  emitProgress(
    onProgress,
    "complete",
    `Analysis complete: ${extractedStatements.length} statements`,
    extractedStatements.length,
    totalSteps,
    totalSteps
  );

  const finalResult: AnalysisResult = {
    statements: extractedStatements,
    relations: relationsResult.relations,
    fallacies: relationsResult.fallacies,
    cycles: relationsResult.cycles,
    speakers,
  };

  // Validate final result
  return AnalysisResultSchema.parse(finalResult);
}

/**
 * Extract partial relation objects from an incomplete JSON buffer.
 */
function extractPartialRelations(raw: string): z.infer<typeof Step2OutputSchema>["relations"] {
  const relRegex = /\{\s*"from":\s*"(S\d+)",\s*"to":\s*"(S\d+)",\s*"type":\s*"(\w+)"(?:,\s*"label":\s*"([^"]*)")?(?:,\s*"details":\s*"([^"]*)")?\s*\}/g;
  const results: z.infer<typeof Step2OutputSchema>["relations"] = [];
  let match;
  while ((match = relRegex.exec(raw)) !== null) {
    results.push({
      from: match[1],
      to: match[2],
      type: match[3] as any,
      label: match[4] || undefined,
      details: match[5] || undefined,
    });
  }
  return results;
}

function extractPartialFallacies(raw: string): NonNullable<z.infer<typeof Step2OutputSchema>["fallacies"]> {
  const falRegex = /\{\s*"statementId":\s*"(S\d+)",\s*"fallacyType":\s*"([^"]+)",\s*"description":\s*"([^"]+)"\s*\}/g;
  const results: NonNullable<z.infer<typeof Step2OutputSchema>["fallacies"]> = [];
  let match;
  while ((match = falRegex.exec(raw)) !== null) {
    results.push({
      statementId: match[1],
      fallacyType: match[2],
      description: match[3],
    });
  }
  return results;
}

function extractPartialCycles(raw: string): NonNullable<z.infer<typeof Step2OutputSchema>["cycles"]> {
  const cycRegex = /\{\s*"nodeIds":\s*(\[[^\]]+\]),\s*"description":\s*"([^"]+)"\s*\}/g;
  const results: NonNullable<z.infer<typeof Step2OutputSchema>["cycles"]> = [];
  let match;
  while ((match = cycRegex.exec(raw)) !== null) {
    try {
      const nodeIds = JSON.parse(match[1]);
      results.push({ nodeIds, description: match[2] });
    } catch { /* incomplete array, skip */ }
  }
  return results;
}

/**
 * JSON extraction helper — mirrors the multi-strategy approach from api.ts.
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  // Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }

  // Markdown fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }

  // Brace match
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0].trim()); } catch { /* fall through */ }
  }

  throw new Error("Failed to extract valid JSON from the API response.");
}
