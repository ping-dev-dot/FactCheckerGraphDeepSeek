/**
 * DeepSeek SSE streaming client.
 * Uses fetch with stream: true to read SSE chunks from the DeepSeek API.
 */

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export interface StreamOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Yields accumulated text from a streaming DeepSeek chat completion.
 * Handles SSE parsing, reconnection with backoff, and [DONE] signal.
 */
export async function* streamChatCompletion(
  options: StreamOptions
): AsyncGenerator<string> {
  const { apiKey, model, systemPrompt, userMessage, temperature = 0.1, maxTokens = 4096 } = options;

  let fullText = "";
  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText);
          detail = parsed?.error?.message || bodyText;
        } catch { /* use raw */ }
        throw new Error(`API error (${response.status}): ${detail}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body reader available");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split("\n");
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              yield delta;
            }
            // Check for finish_reason: if content_filter, it was blocked
            const finishReason = json?.choices?.[0]?.finish_reason;
            if (finishReason === "content_filter") {
              throw new Error("Response was blocked by content filter");
            }
          } catch (e) {
            // If JSON parse failed on a data line, it might be a partial chunk
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      // If we got meaningful text, we're done — don't retry
      if (fullText.length > 0) return;
      // Otherwise, the stream ended with no content; retry
      retries++;

    } catch (err) {
      // Don't retry on content filter or auth errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("content filter")) throw err;

      retries++;
      if (retries > maxRetries) throw err;

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retries), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Non-streaming chat completion — used for steps that don't benefit from streaming.
 */
export async function chatCompletion(
  options: StreamOptions
): Promise<string> {
  const { apiKey, model, systemPrompt, userMessage, temperature = 0.1, maxTokens = 4096 } = options;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    let detail = bodyText;
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed?.error?.message || bodyText;
    } catch { /* use raw */ }
    throw new Error(`API error (${response.status}): ${detail}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error("API returned non-JSON response.");
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("API response did not contain a valid message content.");
  }

  return content;
}
