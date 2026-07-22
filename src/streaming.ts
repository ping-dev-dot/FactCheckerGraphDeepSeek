import type { ApiProvider, LogEntry } from "./types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface StreamOptions {
  provider?: ApiProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  onLog?: (entry: LogEntry) => void;
}

function getApiEndpoint(provider?: ApiProvider): string {
  return provider === "openrouter" ? OPENROUTER_API_URL : DEEPSEEK_API_URL;
}

function getApiHeaders(apiKey: string, provider?: ApiProvider): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] =
      typeof window !== "undefined" ? window.location.origin : "https://factcheckergraph.local";
    headers["X-Title"] = "FactCheckerGraphDeepSeek";
  }
  return headers;
}

function emitLog(
  onLog: ((entry: LogEntry) => void) | undefined,
  level: LogEntry["level"],
  message: string,
  details?: string
) {
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
}

/**
 * Yields accumulated text from a streaming chat completion.
 * Handles SSE parsing, reconnection with backoff, and [DONE] signal.
 */
export async function* streamChatCompletion(
  options: StreamOptions
): AsyncGenerator<string> {
  const { provider, apiKey, model, systemPrompt, userMessage, temperature = 0.1, maxTokens = 4096, onLog } = options;

  let fullText = "";
  let retries = 0;
  const maxRetries = 3;
  const url = getApiEndpoint(provider);
  const headers = getApiHeaders(apiKey, provider);

  const startTime = Date.now();
  let firstTokenReceived = false;
  let lastLoggedLen = 0;

  emitLog(onLog, "info", `[HTTP POST] ${url}`, `Provider: ${provider ?? "deepseek"} | Model: ${model} | Prompt: ${systemPrompt.length} chars | Message: ${userMessage.length} chars`);

  while (retries <= maxRetries) {
    try {
      if (retries > 0) {
        emitLog(onLog, "warn", `Retry attempt ${retries}/${maxRetries} for ${model}`);
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText);
          detail = parsed?.error?.message || bodyText;
        } catch { /* use raw */ }
        const errStr = `API error (${response.status}): ${detail}`;
        emitLog(onLog, "error", errStr);
        throw new Error(errStr);
      }

      emitLog(onLog, "debug", `HTTP 200 OK — Connected to ${provider ?? "deepseek"} stream (${Date.now() - startTime}ms)`);

      const reader = response.body?.getReader();
      if (!reader) {
        emitLog(onLog, "error", "No response body reader available");
        throw new Error("No response body reader available");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let reportedTotalTokens: number | undefined;

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
            if (json?.usage?.total_tokens) {
              reportedTotalTokens = json.usage.total_tokens;
            }

            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                emitLog(onLog, "info", `First SSE token received from ${model} (${Date.now() - startTime}ms)`);
              }

              fullText += delta;
              yield delta;

              if (fullText.length - lastLoggedLen >= 400) {
                lastLoggedLen = fullText.length;
                emitLog(onLog, "debug", `Stream delta: ${fullText.length} chars received (~${Math.round(fullText.length / 4)} tokens)`);
              }
            }
            // Check for finish_reason: if content_filter, it was blocked
            const finishReason = json?.choices?.[0]?.finish_reason;
            if (finishReason === "content_filter") {
              emitLog(onLog, "error", "Response blocked by content filter");
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
      if (fullText.length > 0) {
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const estTokens = reportedTotalTokens ?? Math.ceil((systemPrompt.length + userMessage.length + fullText.length) / 4);
        emitLog(onLog, "info", `Stream complete: ~${estTokens.toLocaleString()} tokens in ${durationSec}s`, `Prompt: ~${Math.ceil((systemPrompt.length + userMessage.length) / 4)} tks | Completion: ~${Math.ceil(fullText.length / 4)} tks`);
        return;
      }
      // Otherwise, the stream ended with no content; retry
      emitLog(onLog, "warn", `Stream ended with 0 content. Retrying...`);
      retries++;

    } catch (err) {
      // Don't retry on content filter or auth errors
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("content filter")) throw err;

      retries++;
      if (retries > maxRetries) {
        emitLog(onLog, "error", `Stream failed after ${maxRetries} retries: ${msg}`);
        throw err;
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retries), 8000);
      emitLog(onLog, "warn", `Waiting ${delay}ms before retry...`);
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
  const { provider, apiKey, model, systemPrompt, userMessage, temperature = 0.1, maxTokens = 4096, onLog } = options;

  const url = getApiEndpoint(provider);
  const headers = getApiHeaders(apiKey, provider);
  const startTime = Date.now();

  emitLog(onLog, "info", `[HTTP POST Non-Streaming] ${url}`, `Model: ${model} | User message: "${userMessage.slice(0, 80)}..."`);

  const response = await fetch(url, {
    method: "POST",
    headers,
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
    const errStr = `API error (${response.status}): ${detail}`;
    emitLog(onLog, "error", errStr);
    throw new Error(errStr);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    emitLog(onLog, "error", "API returned non-JSON response");
    throw new Error("API returned non-JSON response.");
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    emitLog(onLog, "error", "API response did not contain valid message content");
    throw new Error("API response did not contain a valid message content.");
  }

  emitLog(onLog, "debug", `Completion finished in ${Date.now() - startTime}ms (${content.length} chars)`);

  return content;
}
