import assert from "node:assert";
import { Effect } from "effect";
import { searchExa, ExaClientError } from "./exa-client";

async function runTests() {
  console.log("Running exa-client unit tests...");

  // Test 1: Query payload format and headers
  {
    let capturedUrl = "";
    let capturedInit: RequestInit = {};

    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init || {};
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "res-1",
              url: "https://example.com/article",
              title: "Example Article",
              highlights: ["Fact snippet 1", "Fact snippet 2"],
              score: 0.95,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const sources = await Effect.runPromise(
      searchExa("test-api-key", "carbon emissions 2023", 3, mockFetch)
    );

    assert.strictEqual(capturedUrl, "https://api.exa.ai/search");
    const headers = capturedInit.headers as Record<string, string>;
    assert.strictEqual(headers["x-api-key"], "test-api-key");

    const body = JSON.parse(String(capturedInit.body));
    assert.strictEqual(body.query, "carbon emissions 2023");
    assert.strictEqual(body.numResults, 3);
    assert.strictEqual(body.useAutoprompt, true);

    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0].url, "https://example.com/article");
    assert.strictEqual(sources[0].snippet, "Fact snippet 1 Fact snippet 2");
    console.log("  ✓ test_exa_query_payload_format passed");
  }

  // Test 2: Missing API Key
  {
    const program = searchExa("", "test query");
    await Effect.runPromise(program).then(
      () => {
        assert.fail("Should have failed on empty API key");
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /missing or empty/i);
      }
    );
    console.log("  ✓ test_exa_handles_missing_api_key passed");
  }

  // Test 3: Handles 401 Unauthorized
  {
    const mockFetch = (async () => {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }) as typeof fetch;

    await Effect.runPromise(searchExa("invalid-key", "test", 5, mockFetch)).then(
      () => assert.fail("Should have failed with 401"),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /401/);
      }
    );
    console.log("  ✓ test_exa_handles_401_unauthorized passed");
  }

  // Test 4: Handles 429 Rate Limit
  {
    const mockFetch = (async () => {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
    }) as typeof fetch;

    await Effect.runPromise(searchExa("valid-key", "test", 5, mockFetch)).then(
      () => assert.fail("Should have failed with 429"),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.match(msg, /429/);
      }
    );
    console.log("  ✓ test_exa_handles_rate_limits passed");
  }

  console.log("All exa-client tests passed successfully!\n");
}

runTests().catch((err) => {
  console.error("exa-client tests failed:", err);
  process.exit(1);
});
