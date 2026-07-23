/**
 * Exa.ai Search Client — Effect-based REST wrapper for Exa neural search.
 */

import { Effect } from "effect";
import type { EvidenceSource } from "../shared/types";

export interface ExaSearchResultItem {
  id: string;
  url: string;
  title: string;
  publishedDate?: string;
  author?: string;
  highlights?: string[];
  text?: string;
  score?: number;
}

export class ExaClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ExaClientError";
  }
}

export function searchExa(
  apiKey: string,
  query: string,
  numResults = 5,
  fetchFn: typeof fetch = fetch
): Effect.Effect<EvidenceSource[], ExaClientError> {
  return Effect.tryPromise({
    try: async () => {
      if (!apiKey || !apiKey.trim()) {
        throw new ExaClientError("EXA_API_KEY is missing or empty");
      }

      const res = await fetchFn("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          numResults,
          useAutoprompt: true,
          contents: {
            highlights: { numSentences: 3, highlightsPerUrl: 2 },
          },
        }),
      });

      if (!res.ok) {
        throw new ExaClientError(`Exa API request failed with status ${res.status}`, res.status);
      }

      const data = (await res.json()) as { results?: ExaSearchResultItem[] };
      const rawResults = data.results ?? [];

      return rawResults.map((item, idx) => {
        const snippet =
          item.highlights && item.highlights.length > 0
            ? item.highlights.join(" ")
            : item.text
            ? item.text.slice(0, 300)
            : item.title;

        return {
          id: item.id || `exa-${idx + 1}`,
          url: item.url,
          title: item.title || item.url,
          publishedDate: item.publishedDate,
          author: item.author,
          snippet,
          score: item.score,
        };
      });
    },
    catch: (err) => {
      if (err instanceof ExaClientError) return err;
      return new ExaClientError(`Exa search failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });
}
