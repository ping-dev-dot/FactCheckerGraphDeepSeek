---
title: "E2E tests with real API calls catch gateway routing and LLM output format errors"
category: testing
severity: high
tags: [e2e, real-api, ai-gateway, deepseek, mock-false-positive, token-streaming, ndjson, llm-output]
applies_when:
  - "Mocked AI client tests pass but real API calls fail"
  - "LLM output format (NDJSON, markdown fence, JSON array) differs from mock data"
  - "Gateway routing errors only surface in production"
---

## Problem

Unit tests with mocked AI clients passed, but real API calls failed because:
1. Mock used correct provider URL; real code used wrong gateway endpoint
2. Mock yielded complete NDJSON lines; real stream yields token-by-token chunks
3. Mock output always parsed; real LLM wraps JSON in markdown fences or returns arrays

## Solution

Write E2E tests that call the **real AI Gateway** with **actual system prompts**:

```typescript
// src/do/pipeline-e2e.test.ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

const provider = createOpenAICompatible({ baseURL: GATEWAY_URL, ... });
const model = provider.chatModel("deepseek-chat");

// Test step 1 with real prompt and sample text
const { textStream } = streamText({
  model,
  system: STEP1_EXTRACTION_PROMPT,  // the actual prompt
  prompt: sampleText,
  maxTokens: 2000,
});

const buffer = createJsonBuffer(Schema.Array(StatementSchema), "array");
for await (const chunk of textStream) {
  const { parsed } = buffer.push(chunk);
  // verify incremental parsing works with real token chunks
}

const statements = buffer.flush();
assert(statements.length >= 2, "Real model returns enough statements");
```

## What to test with real API calls

| Test | Why mocks miss it |
|------|-------------------|
| Token-by-token NDJSON parsing | Mock yields complete lines; real yields 1-5 char chunks |
| Markdown-fenced JSON output | LLM may wrap output in ```json ``` |
| JSON array instead of NDJSON | LLM may return [...] instead of line-delimited objects |
| Gateway URL routing | Mock doesn't validate the actual HTTP endpoint |
| Empty/malformed streams | Real API can return empty responses or errors |

## Detection

- All unit tests pass but the app shows "Analysis Failed" with extraction errors
- `curl` to the actual gateway URL succeeds but app code fails
- Different error messages between dev and production
