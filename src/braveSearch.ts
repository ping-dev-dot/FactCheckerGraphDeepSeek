/**
 * Brave LLM Context API client.
 * Endpoint: GET https://api.search.brave.com/res/v1/llm/context
 * Auth: X-Subscription-Token header
 * 
 * In the browser, requests go through the Vite proxy (/api/brave) to avoid CORS.
 * In Node.js (tests), requests go directly to api.search.brave.com.
 */

const BRAVE_API_BASE = typeof window !== "undefined"
  ? "/api/brave"          // browser: proxied through Vite dev server
  : "https://api.search.brave.com";  // Node.js: direct

const BRAVE_API_PATH = "/res/v1/llm/context";

export interface BraveSearchOptions {
  apiKey: string;
  query: string;
  count?: number;
  maxTokens?: number;
  country?: string;
}

export interface BraveSourceSnippet {
  url: string;
  title: string;
  snippets: string[];
}

export interface BraveSearchResult {
  grounding: {
    generic: BraveSourceSnippet[];
  };
  sources: Record<string, { title: string; hostname: string; age: string[] | null }>;
}

export class BraveSearchError extends Error {
  public readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "BraveSearchError";
    this.status = status;
  }
}

/**
 * Truncate a query to within Brave's limits (400 chars, 50 words).
 */
function truncateQuery(query: string): string {
  const words = query.trim().split(/\s+/);
  let truncated = words.slice(0, 50).join(" ").slice(0, 400);
  // Don't cut mid-word at character boundary
  if (truncated.length < query.length) {
    truncated = truncated.replace(/\s+\S*$/, "");
  }
  return truncated;
}

/**
 * Search Brave LLM Context API and return pre-extracted web content.
 */
export async function searchBraveLLMContext(
  options: BraveSearchOptions
): Promise<BraveSearchResult> {
  const {
    apiKey,
    query,
    count = 20,
    maxTokens = 8192,
    country = "US",
  } = options;

  const q = truncateQuery(query);

  const params = new URLSearchParams({
    q,
    count: String(count),
    maximum_number_of_tokens: String(maxTokens),
    country,
    context_threshold_mode: "balanced",
  });

  const url = `${BRAVE_API_BASE}${BRAVE_API_PATH}?${params}`;

  let lastError: Error | null = null;

  // Retry loop: up to 2 attempts
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const status = response.status;

        if (status === 401) {
          throw new BraveSearchError("Invalid Brave API key.", status);
        }
        if (status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
          await new Promise((r) => setTimeout(r, delay));
          lastError = new BraveSearchError("Brave API rate limited.", status);
          continue;
        }
        throw new BraveSearchError(
          `Brave API error (${status}): ${body.slice(0, 200)}`,
          status
        );
      }

      const data = await response.json();
      return data as BraveSearchResult;
    } catch (err) {
      if (err instanceof BraveSearchError) {
        lastError = err;
        if (err.status === 401) throw err; // Don't retry bad key
      } else if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new BraveSearchError("Brave API request timed out.");
      } else {
        lastError = err as Error;
      }
    }
  }

  throw lastError ?? new BraveSearchError("Unknown Brave API error.");
}
