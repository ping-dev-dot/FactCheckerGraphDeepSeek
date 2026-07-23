# Cloudflare Stack Migration — Requirements

**Date**: 2026-07-23
**Status**: Approved → ready for 02-plan

## Overview

Migrate FactCheckerGraphDeepSeek from client-side-only React SPA to Cloudflare stack:
- **Frontend**: Same React SPA, served as static assets from Cloudflare Worker
- **Backend**: EffectJS in a Durable Object orchestrating the analysis pipeline
- **API Keys**: Secrets Store → AI Gateway BYOK (never touches browser)
- **LLM Proxy**: `env.AI.run()` through AI Gateway → DeepSeek

## Target Architecture

```
Browser (React SPA)
    │  GET /* → static assets (index.html, JS, CSS)
    │  POST /api/analyze { text } → creates DO, returns { analysisId }
    │  GET /api/analyze/:id/stream → SSE progress stream from DO
    ▼
Cloudflare Worker (EffectJS routing layer)
    │  Static asset serving via assets binding
    │  API routing to Durable Objects
    ▼
Durable Object (one per analysis)
    │  Orchestrates full pipeline via EffectJS
    │  Calls DeepSeek through AI Gateway using env.AI
    │  Streams progress events as SSE to client
    ▼
AI Gateway → DeepSeek
    │  BYOK via Secrets Store (no API keys in browser)
    │  env.AI.run("deepseek-chat", ...)
```

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **DO orchestrates pipeline, SSE to client** | DOs support streaming, have exactly-once semantics |
| 2 | **One DO per analysis** | Natural isolation, DO state = analysis state |
| 3 | **Flat monorepo** (client/, do/, shared/ under src/) | Simplest, avoids workspace overhead |
| 4 | **effect/Schema over Zod** | Native Effect integration, JSON Schema generation, equivalent type inference (`Schema.Schema.Type<T>`) |
| 5 | **Full parallel scoring** | AI Gateway handles rate limiting, no manual batching |
| 6 | **Partial results on failure** (current behavior) | User sees what succeeded even if later steps fail |
| 7 | **`npm run dev` via `wrangler dev`** | Wrangler serves static assets + DO, single command |
| 8 | **Cancel via SSE disconnect** | Client closes stream, DO detects abort via request.signal |
| 9 | **env.AI for DeepSeek calls** | Cloudflare-native, no manual HTTP/fetch for AI calls |

## Architecture Boundaries

1. **Worker** (`src/worker.ts`): HTTP routing, static asset fallthrough, DO creation, SSE relay
2. **Durable Object** (`src/do/`): Pipeline orchestration (EffectJS), AI calls (env.AI), progress events
3. **Shared** (`src/shared/`): Prompts (NO changes), effect/Schema types, speaker detection, text chunking, JSON extractor
4. **Client** (`src/client/`): React SPA — remove API key input, call /api/analyze

## What Changes

| File | Fate |
|------|------|
| `src/pipeline.ts` | Rewritten as DO with Effect.gen orchestration |
| `src/streaming.ts` | Removed (replaced by env.AI + Gateway) |
| `src/api.ts` | Removed (legacy) |
| `src/types.ts` | Rewritten in effect/Schema (shared) |
| `src/App.tsx` | API key input removed, calls /api/analyze |
| `src/prompts.ts` | NO CHANGES (shared, untouched) |
| `src/speakerDetection.ts` | NO LOGIC CHANGES (moves to shared/) |
| `src/textChunking.ts` | NO LOGIC CHANGES (moves to shared/) |
| `src/bufferedJsonExtractor.ts` | Port to Effect types (moves to shared/) |

## What Stays the Same

- All system prompts (`prompts.ts`)
- All React components (InputPanel, GraphCanvas, StatementNode, ArgumentEdge, DetailSidebar, etc.)
- Speaker detection regex logic
- Text chunking algorithm
- JSON extraction strategies
- Catppuccin theme and CSS

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| DO cold start latency | Acceptable for analysis (not real-time) |
| SSE unidirectional (no cancel) | Detect disconnect via request.signal |
| effect/Schema vs Zod migration | Mechanical find-replace, same structure |
| env.AI SSE streaming support | Verify DeepSeek provider supports stream: true via AI Gateway |
| Worker + DO in one codebase | Vite excludes DO code from client build, Wrangler handles DO build |
