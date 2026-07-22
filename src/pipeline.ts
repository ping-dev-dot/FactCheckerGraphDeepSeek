/**
 * Multi-step analysis pipeline orchestrator.
 * Preprocess → Extract statements (streaming) → Analyze relations → Score facts.
 * Each step can fail independently; partial results are surfaced.
 */

import { z } from "zod";
import type {
  AnalysisResult,
  ApiSettings,
  LogEntry,
  PartialAnalysisResult,
  PipelineProgress,
  PipelineStage,
  Statement,
  Speaker,
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

const DEFAULT_MODEL = "deepseek-chat";

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
  totalSteps: number,
  elapsedMs?: number,
  totalTokens?: number
) {
  onProgress({
    stage,
    message,
    statementsFound,
    totalSteps,
    currentStep,
    elapsedMs,
    totalTokens,
  });
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
  apiSettingsOrKey: string | ApiSettings,
  onProgress: (progress: PipelineProgress) => void,
  onStatements: (statements: Statement[]) => void,
  onPartialResult: (result: PartialAnalysisResult) => void,
  onLog?: (entry: LogEntry) => void
): Promise<AnalysisResult> {
  const apiSettings: ApiSettings =
    typeof apiSettingsOrKey === "string"
      ? { provider: "deepseek", apiKey: apiSettingsOrKey, model: DEFAULT_MODEL }
      : apiSettingsOrKey;

  const { provider, apiKey, model } = apiSettings;

  const emitLog = (level: LogEntry["level"], message: string, details?: string) => {
    if (!onLog) return;
    const now = new Date();
    const timestamp =
      now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
    onLog({
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      level,
      message,
      details,
    });
  };

  if (!apiKey.trim()) throw new Error("API key is required.");
  if (!text.trim()) throw new Error("Argument text is required.");

  const pipelineStartTime = Date.now();
  let totalTokensUsed = 0;
  const totalSteps = 3; // extract, relations, scoring
  let extractedStatements: Statement[] = [];
  let speakers: Speaker[] = [];

  const updateProgress = (stage: PipelineStage, msg: string, step: number) => {
    emitProgress(
      onProgress,
      stage,
      msg,
      extractedStatements.length,
      step,
      totalSteps,
      Date.now() - pipelineStartTime,
      totalTokensUsed
    );
  };

  // ── Step 0: Preprocessing ──
  updateProgress("preprocessing", "Detecting speakers...", 0);
  emitLog("info", "Step 0: Preprocessing started", `Input length: ${text.length} chars`);

  const detection = detectSpeakers(text);
  speakers = detection.speakers;
  emitLog("debug", `Detected ${speakers.length} speaker(s)`, speakers.map((s) => s.name).join(", "));

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
    totalTokensUsed += estimateTokens(STEP1_EXTRACTION_PROMPT + chunk);
    updateProgress("extracting", "Extracting statements...", 1);

    const jsonBuffer = createJsonBuffer<Statement[]>(StatementArraySchema, "array");

    try {
      emitLog("info", `Step 1: Streaming chunk ${ci + 1}/${chunks.length} with ${model}`);
      const stream = streamChatCompletion({
        provider,
        apiKey,
        model,
        systemPrompt: STEP1_EXTRACTION_PROMPT,
        userMessage: chunk,
        maxTokens: 4096,
        onLog,
      });

      let lastStatements: Statement[] = [];
      for await (const delta of stream) {
        totalTokensUsed += Math.max(1, Math.ceil(delta.length / 4));
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
          updateProgress("extracting", "Extracting statements...", 1);
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

    totalTokensUsed += estimateTokens(STEP2_RELATIONS_PROMPT + stmtList);
    updateProgress("analyzing_relations", "Analyzing logical relationships...", 2);

    // Stream step 2 to show live relation/fallacy/cycle counts
    const step2JsonBuffer = createJsonBuffer<z.infer<typeof Step2OutputSchema>>(
      Step2OutputSchema,
      "single"
    );

    let lastRelCount = 0;
    let lastFalCount = 0;
    let lastCycCount = 0;

    emitLog("info", `Step 2: Streaming relations with ${model}`, `Analyzing ${extractedStatements.length} statements`);
    const step2Stream = streamChatCompletion({
      provider,
      apiKey,
      model,
      systemPrompt: STEP2_RELATIONS_PROMPT,
      userMessage: `Statements to analyze:\n\n${stmtList}`,
      maxTokens: 4096,
      onLog,
    });

    let didParse = false;
    for await (const delta of step2Stream) {
      totalTokensUsed += Math.max(1, Math.ceil(delta.length / 4));
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
        updateProgress("analyzing_relations", `Linking: ${parts.join(", ") || "analyzing..."}`, 2);

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
  updateProgress("scoring", "Scoring fact-check difficulty...", 3);

  // Score statements that lack difficulty scores
  const unscored = extractedStatements.filter(
    (s) => s.factCheckDifficulty === undefined || s.factCheckDifficulty === 50
  );

  if (unscored.length > 0) {
    // Batch process: score 5 at a time
    const batchSize = 5;
    for (let i = 0; i < unscored.length; i += batchSize) {
      const batch = unscored.slice(i, i + batchSize);
      totalTokensUsed += batch.reduce((sum, stmt) => sum + estimateTokens(STEP3_SCORING_PROMPT + stmt.text), 0);
      try {
        const scores = await Promise.all(
          batch.map(async (stmt) => {
            const resp = await chatCompletion({
              provider,
              apiKey,
              model,
              systemPrompt: STEP3_SCORING_PROMPT,
              userMessage: `Statement: "${stmt.text}"`,
              maxTokens: 256,
              onLog,
            });
            totalTokensUsed += estimateTokens(resp);
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
        updateProgress("scoring", `Scoring fact-check difficulty... (${Math.min(i + batchSize, unscored.length)}/${unscored.length})`, 3);
      } catch {
        // Scoring failure is non-fatal — keep default scores
      }
    }
  }

  // ── Build final result ──
  updateProgress("complete", `Analysis complete: ${extractedStatements.length} statements`, 3);

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
