/**
 * Incremental JSON buffer for streaming API responses.
 * Ported from bufferedJsonExtractor.ts — uses effect/Schema instead of Zod.
 */

import { Schema } from "effect";

type AnySchema = Schema.Schema<any, any, never>;

function tryExtractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strategy 1: direct parse
  try { return JSON.parse(trimmed); } catch { /* fall through */ }

  // Strategy 2: markdown fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
  }

  // Strategy 3: brace match
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0].trim()); } catch { /* fall through */ }
  }

  // Strategy 4: array match
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0].trim()); } catch { /* fall through */ }
  }

  return null;
}

export interface JsonBuffer<T> {
  push(chunk: string): { parsed: T | null; raw: string };
  flush(): T;
  getBuffer(): string;
}

export function createJsonBuffer<T>(
  schema: AnySchema,
  mode: "single" | "array" = "single"
): JsonBuffer<T> {
  let buffer = "";
  let lastParsedCount = 0;
  let accumulatedItems: any[] = [];

  function tryParse(raw: string): T | null {
    const result = tryExtractJson(raw);
    if (result === null) return null;

    const parsed = Schema.decodeUnknownEither(schema)(result);
    if (parsed._tag === "Right") return parsed.right as T;
    return null;
  }

  function push(chunk: string): { parsed: T | null; raw: string } {
    buffer += chunk;

    if (mode === "array") {
      const lines = buffer.split("\n");
      const complete = lines.slice(0, -1);
      buffer = lines[lines.length - 1] ?? "";

      for (const line of complete) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          accumulatedItems.push(JSON.parse(trimmed));
        } catch {
          buffer = trimmed + "\n" + buffer;
        }
      }

      if (accumulatedItems.length > lastParsedCount) {
        lastParsedCount = accumulatedItems.length;
        const parsed = Schema.decodeUnknownEither(schema)(accumulatedItems);
        if (parsed._tag === "Right") return { parsed: parsed.right as T, raw: buffer };
      }
    }

    // Try full parse
    const result = tryParse(buffer);
    if (result !== null) return { parsed: result, raw: buffer };

    return { parsed: null, raw: buffer };
  }

  function flush(): T {
    if (mode === "array" && accumulatedItems.length > 0) {
      const parsed = Schema.decodeUnknownEither(schema)(accumulatedItems);
      if (parsed._tag === "Right") return parsed.right as T;
    }

    const result = tryParse(buffer);
    if (result !== null) return result;

    throw new Error(
      "Failed to extract valid JSON from the complete stream. " +
      "The model may have returned malformed output."
    );
  }

  return { push, flush, getBuffer: () => buffer };
}
