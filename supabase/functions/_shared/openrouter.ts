export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function extractJson(text: string): string {
  let cleaned = text.trim();
  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = cleaned.match(fenceRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  } else {
    // If not matched fully by regex, find first { or [ and last } or ]
    const firstBrace = cleaned.search(/[{[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }
  return cleaned;
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  temperature = 0.0,
  model = "deepseek/deepseek-chat"
): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("DEEPSEEK_API_KEY") || "";
  const baseUrl = Deno.env.get("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY or DEEPSEEK_API_KEY environment variable");
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://supabase.com",
      "X-Title": "FactCheckerGraphDeepSeek",
    },
    body: JSON.stringify({
      model: model,
      messages,
      response_format: { type: "json_object" },
      temperature,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenRouter LLM call failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  return extractJson(rawContent);
}
