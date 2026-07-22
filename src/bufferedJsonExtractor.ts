/**
 * Incremental JSON buffer for streaming API responses.
 * Tries to parse complete JSON objects from an accumulating text stream,
 * distinguishing between "incomplete" (keep waiting) and "malformed" (real error).
 */

import type { ZodSchema } from "zod";

function tryExtractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strategy 1: direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }

  // Strategy 2: markdown fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Strategy 3: brace match
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0].trim());
    } catch { /* fall through */ }
  }

  // Strategy 4: array match (for statement arrays)
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0].trim());
    } catch { /* fall through */ }
  }

  return null;
}

export interface JsonBuffer<T> {
  /** Push a new chunk of text. Returns parsed result if complete, null if still waiting. */
  push(chunk: string): { parsed: T | null; raw: string };
  /** Final attempt to parse after stream ends. Returns parsed result or throws. */
  flush(): T;
  /** Get the current raw buffer (for progress inspection). */
  getBuffer(): string;
}

/**
 * Creates a buffered JSON extractor that incrementally parses from a streaming text source.
 * For array output (statement lists), it also supports newline-delimited JSON objects.
 */
export function createJsonBuffer<T>(
  schema: ZodSchema<T>,
  mode: "single" | "array" = "single"
): JsonBuffer<T> {
  let buffer = "";
  let lastParsedCount = 0;
  let accumulatedItems: any[] = [];

  function tryParse(raw: string): T | null {
    const result = tryExtractJson(raw);
    if (result === null) return null;

    const parsed = schema.safeParse(result);
    if (parsed.success) {
      return parsed.data;
    }
    return null;
  }

  function push(chunk: string): { parsed: T | null; raw: string } {
    buffer += chunk;

    if (mode === "array") {
      // Newline-delimited JSON: try parsing individual lines as they complete
      const lines = buffer.split("\n");
      // Keep incomplete last line
      const complete = lines.slice(0, -1);
      buffer = lines[lines.length - 1] ?? "";

      for (const line of complete) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          accumulatedItems.push(JSON.parse(trimmed));
        } catch {
          // Put it back in buffer — might be partial
          buffer = trimmed + "\n" + buffer;
        }
      }

      if (accumulatedItems.length > lastParsedCount) {
        lastParsedCount = accumulatedItems.length;
        const result = schema.safeParse(accumulatedItems);
        if (result.success) {
          return { parsed: result.data, raw: buffer };
        }
      }
    }

    // Try full parse
    const result = tryParse(buffer);
    if (result !== null) {
      return { parsed: result, raw: buffer };
    }

    return { parsed: null, raw: buffer };
  }

  function flush(): T {
    // For array mode: try accumulated items
    if (mode === "array" && accumulatedItems.length > 0) {
      const result = schema.safeParse(accumulatedItems);
      if (result.success) return result.data;
    }

    // Final parse attempt on full buffer
    const result = tryParse(buffer);
    if (result !== null) return result;

    throw new Error(
      "Failed to extract valid JSON from the complete stream. " +
      "The model may have returned malformed output."
    );
  }

  return { push, flush, getBuffer: () => buffer };
}
