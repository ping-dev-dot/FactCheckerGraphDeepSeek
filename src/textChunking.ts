/**
 * Conservative text chunking for large inputs exceeding context windows.
 * Estimates ~1 token per 4 characters. Splits at sentence boundaries.
 */

const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 3000;

/**
 * Split text into chunks that fit within the token budget.
 * Each chunk preserves context from prior chunks via a preamble.
 */
export function chunkText(
  text: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): string[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const trimmed = text.trim();

  // Small enough — no chunking needed
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const chunks: string[] = [];
  const sentences = splitSentences(trimmed);
  let currentChunk = "";
  let previousSentences: string[] = [];

  for (const sentence of sentences) {
    // Check if adding this sentence would exceed the limit
    if (currentChunk.length + sentence.length + 1 > maxChars - 200) {
      // Save current chunk
      if (currentChunk.trim()) {
        chunks.push(buildChunk(currentChunk, previousSentences));
        // Keep last 2 sentences as context for next chunk
        const chunkSentences = splitSentences(currentChunk);
        previousSentences = chunkSentences.slice(-2);
        currentChunk = sentence;
      } else {
        // Single sentence is too large — force include it
        chunks.push(buildChunk(sentence, previousSentences));
        previousSentences = [sentence];
        currentChunk = "";
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  // Final chunk
  if (currentChunk.trim()) {
    chunks.push(buildChunk(currentChunk, previousSentences));
  }

  return chunks;
}

function buildChunk(text: string, previous: string[]): string {
  if (previous.length === 0) return text;
  const context = previous.join(" ");
  return `[Previous context: ${context}]\n\n${text}`;
}

/**
 * Split text into sentences, being careful about abbreviations and edge cases.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space and capital letter
  // Avoid splitting on common abbreviations
  const abbreviationMap = /(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K))(?<=[.!?])\s+(?=[A-Z])/;
  return text.split(abbreviationMap).map((s) => s.trim()).filter(Boolean);
}

/**
 * Estimate token count for a string (conservative: 1 token ≈ 4 characters).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
