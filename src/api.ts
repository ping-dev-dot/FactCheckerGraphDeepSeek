import { ZodError } from "zod";
import type { AnalysisResult } from "./types";
import { AnalysisResultSchema } from "./types";
import { SYSTEM_PROMPT } from "./prompts";

// Re-export pipeline for new callers
export { runAnalysisPipeline } from "./pipeline";
export type { PipelineProgress, PipelineStage, PartialAnalysisResult } from "./types";
export { PipelineStepError } from "./types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export class DeepSeekError extends Error {
  public readonly status?: number;
  public readonly body?: string;

  constructor(
    message: string,
    status?: number,
    body?: string
  ) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
    this.body = body;
  }
}

function extractJson(raw: string): unknown {
  // Try to find JSON object in the response
  const trimmed = raw.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  // Try to extract from markdown fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      return JSON.parse(inner);
    } catch {
      // fall through
    }
  }

  // Try to find first { ... } pair
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    const candidate = braceMatch[0].trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // fall through
    }
  }

  throw new DeepSeekError(
    "Failed to extract valid JSON from the API response. The model may have returned malformed output."
  );
}

/**
 * Legacy single-call analysis. Kept for backward compatibility.
 * @deprecated Consider using runAnalysisPipeline() directly for streaming and partial results.
 */
export async function analyzeArgument(
  text: string,
  apiKey: string
): Promise<AnalysisResult> {
  if (!apiKey.trim()) {
    throw new DeepSeekError("API key is required.");
  }

  if (!text.trim()) {
    throw new DeepSeekError("Argument text is required.");
  }

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });
  } catch (err) {
    throw new DeepSeekError(
      `Network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const bodyText = await response.text();

  if (!response.ok) {
    let detail = bodyText;
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed?.error?.message || bodyText;
    } catch {
      // use raw body
    }
    throw new DeepSeekError(
      `API error (${response.status}): ${detail}`,
      response.status,
      bodyText
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new DeepSeekError("API returned non-JSON response.");
  }

  // Extract the assistant's message content
  const content =
    (parsed as any)?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new DeepSeekError(
      "API response did not contain a valid message content."
    );
  }

  const result = extractJson(content);

  try {
    return AnalysisResultSchema.parse(result);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new DeepSeekError(
        `Response validation failed: ${issues}`
      );
    }
    throw new DeepSeekError(
      `Response validation failed: ${String(err)}`
    );
  }
}
