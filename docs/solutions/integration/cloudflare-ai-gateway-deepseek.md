---
title: "Cloudflare AI Gateway with DeepSeek — use @ai-sdk/openai-compatible, not ai-gateway-provider"
category: integration
severity: high
tags: [cloudflare, ai-gateway, deepseek, ai-sdk, openai-compatible, ai-gateway-provider, BYOK, gateway-routing]
applies_when:
  - "Routing DeepSeek API calls through Cloudflare AI Gateway"
  - "Using the Vercel AI SDK with Cloudflare AI Gateway"
  - "AI calls fail with 'No such model' or 400 errors from /compat endpoint"
---

## Problem

`ai-gateway-provider` with `createUnified()` routes all models through the `/compat` endpoint (`gateway.ai.cloudflare.com/v1/compat/chat/completions`). This endpoint only supports Workers AI models (`@cf/meta/llama-3.3-70b`, etc.). Third-party providers like DeepSeek need the provider-specific endpoint.

## Root Cause

`ai-gateway-provider` was designed for Workers AI models, not third-party providers. The unified provider maps model names to the generic `/compat` path, but Cloudflare AI Gateway requires provider-specific paths for third-party models: `/deepseek/chat/completions`, `/openai/chat/completions`, etc.

## Solution

Use `@ai-sdk/openai-compatible` pointed directly at the provider-specific gateway URL:

```typescript
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText } from "ai";

const provider = createOpenAICompatible({
  baseURL: `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${GATEWAY_NAME}/deepseek`,
  headers: { "cf-aig-authorization": `Bearer ${CF_AIG_TOKEN}` },
  name: "deepseek-gateway",
});

const model = provider.chatModel("deepseek-chat");

// Streaming
const { textStream } = streamText({ model, system, prompt, maxTokens });
for await (const chunk of textStream) { /* token-by-token chunks */ }

// Non-streaming
const { text } = await generateText({ model, system, prompt, maxTokens });
```

## Prerequisites

1. AI Gateway created in Cloudflare Dashboard (AI → AI Gateway → Create Gateway)
2. DeepSeek API key connected via BYOK (Provider Keys → Add API Key)
3. `CF_AIG_TOKEN` — a Cloudflare API token with AI Gateway access
4. Account ID from Cloudflare Dashboard

## URL structure

```
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/deepseek/chat/completions
```

The gateway injects the stored DeepSeek API key automatically via BYOK — no DeepSeek key in code.
