import { ZodError } from "zod";
import type { AnalysisResult } from "./types";
import { AnalysisResultSchema } from "./types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

const SYSTEM_PROMPT = `You are an expert logical analyst. Given an argumentative text, you must:

1. Decompose the text into **atomic statements** — each a single, self-contained claim. Assign each a unique ID like "S1", "S2", etc.
2. For each statement, estimate its **fact-check difficulty** as a percentage (0% = trivially verifiable, 100% = practically impossible to verify). Provide a short explanation.
3. Identify **logical relationships** between statements: implication (A→B), conjunction (A∧B), disjunction (A∨B), supports, contradiction, or fallacy. Each relation links a "from" and "to" statement ID.
4. Flag **logical fallacies** with the statement ID they apply to, the fallacy type (e.g., Ad Hominem, Straw Man, False Dilemma, Begging the Question, Circular Reasoning, etc.), and a short description.
5. Detect **cycles** (circular reasoning loops) — list the node IDs involved and a short description.

Return ONLY valid JSON with this exact structure (no markdown fences, no extra text):
{
  "statements": [{ "id": "S1", "text": "...", "factCheckDifficulty": 30, "factCheckExplanation": "..." }],
  "relations": [{ "from": "S1", "to": "S2", "type": "implication", "label": "implies", "details": "..." }],
  "fallacies": [{ "statementId": "S1", "fallacyType": "Ad Hominem", "description": "..." }],
  "cycles": [{ "nodeIds": ["S1", "S2"], "description": "S1 and S2 form a circular dependency" }]
}

Relation types: "implication", "conjunction", "disjunction", "supports", "contradiction", "fallacy"
Fallacy types: "Ad Hominem", "Straw Man", "False Dilemma", "Begging the Question", "Circular Reasoning", "Appeal to Authority", "Slippery Slope", "Red Herring", "Hasty Generalization", "False Equivalence"`;

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
