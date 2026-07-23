# Cloudflare Stack Migration — Implementation Plan

**Date**: 2026-07-23
**Source**: `docs/brainstorms/2026-07-23-cloudflare-migration-requirements.md`
**Review**: Strict CEO Review passed — AI SDK adjustment, error/rescue map, failure modes registry, test diagram

## Problem Summary

Migrate FactCheckerGraphDeepSeek from a client-side-only React SPA that sends API keys directly from the browser, to a Cloudflare-native stack: Worker for static asset serving and routing, Durable Object for the analysis pipeline using full EffectJS (typed errors, services/layers, structured concurrency), AI Gateway as the DeepSeek proxy with BYOK, and the `ai` SDK for LLM calls.

**Existing infrastructure**: Account `unendlicherping` (ce6ed2c0c296f91487c51bff4c8133e0), AI Gateway `fact-checker` with DeepSeek API key connected via BYOK.

## Relevant Learnings

None — no prior solutions exist.

## Scope Boundaries

**In scope**:
- Restructure codebase into `src/client/`, `src/do/`, `src/shared/`
- Port Zod schemas to effect/Schema
- Rewrite pipeline as Durable Object with EffectJS orchestration
- Worker HTTP routing + static asset serving
- Client: remove API key input, call `/api/analyze` + SSE
- Build wiring: `npm run dev` = `wrangler dev`

**Out of scope**:
- AI Gateway BYOK setup (already done via dashboard — gateway `fact-checker` exists)
- User accounts / history / sharing
- Backend migration beyond Cloudflare
- Mobile UX overhaul
- DO crash-reconnect (stretch goal: persist step results to `this.ctx.storage`)

## Architecture Decisions

No ADR-worthy decisions — all architectural choices are captured in the brainstorm requirements.

## Implementation Units

---

### U1: Project Scaffold & Dependencies

**Goal**: Transform the Vite-only React project into a Wrangler project with EffectJS, AI SDK, and the new directory structure.

**Files**:
- Modify: `package.json` (add `effect`, `@effect/schema`, `ai`, `@ai-sdk/openai-compatible`, `ai-gateway-provider`; update `scripts`)
- Create: `wrangler.jsonc` (DO + static assets config, CF_AIG_TOKEN secret ref)
- Create: `tsconfig.do.json` (for DO/Worker TypeScript)
- Modify: `vite.config.ts` (output to `dist/`)
- Create: `.dev.vars` (CF_AIG_TOKEN for local dev)
- Move: `src/*` → `src/client/`, `src/shared/`, `src/do/` (skeleton stubs)
- Create: `.env.example` (template for required env vars)

**Patterns to follow**: Cloudflare Workers SPA template, Effect installation guide

**Test scenarios**: N/A (infrastructure — verified by `npm run dev` starting successfully)

**Verification**:
```bash
npm run dev  # wrangler dev starts, serves index.html, responds to /api/*
```

**Dependencies**: None (first unit)

---

### U2: Shared Schemas (effect/Schema)

**Goal**: Port all Zod schemas from `types.ts` to `effect/Schema` with equivalent type inference and validation.

**Files**:
- Create: `src/shared/schemas.ts` — Statement, Speaker, Relation, AnalysisResult, PartialAnalysisResult schemas
- Create: `src/shared/schemas.test.ts` — RED→GREEN TDD cycle
- Keep: `src/shared/types.ts` (re-exported TS types from schemas, color helpers, constants)

**Patterns to follow**: Effect Schema docs (Struct, Literal, Array, optional, between, Schema.Schema.Type)

**Test scenarios**:
- Happy path: valid data passes `Schema.decodeUnknownEither` (returns Right)
- Edge case: missing optional fields (speakerId, factCheckExplanation) pass with defaults
- Edge case: factCheckDifficulty bounds (0-100), negative and >100 rejected
- Edge case: relation type enum validation (only valid types accepted)
- Error path: malformed data returns Left with structured ParseError

**Verification**:
```bash
npx tsx src/shared/schemas.test.ts
```

**Dependencies**: U1

---

### U3: Shared Utilities

**Goal**: Move prompts (unchanged), speaker detection (unchanged), text chunking (unchanged). Port JSON extractor from Zod to effect/Schema types.

**Files**:
- Move: `src/prompts.ts` → `src/shared/prompts.ts` (NO content changes)
- Move: `src/speakerDetection.ts` → `src/shared/speaker-detection.ts` (update imports to effect/Schema types)
- Move: `src/textChunking.ts` → `src/shared/text-chunking.ts` (NO logic changes)
- Port: `src/bufferedJsonExtractor.ts` → `src/shared/json-extractor.ts` (use effect/Schema types, Effect for error handling)
- Create: `src/shared/utilities.test.ts` — combined test file

**Patterns to follow**: Current verify-e2e.ts patterns, effect/Schema for validation types

**Test scenarios**:
- Speaker detection: multi-speaker, single, role-based, non-name words, color assignment
- Text chunking: short text, long text (>1 chunk), context preamble, mid-sentence safety
- JSON extractor NDJSON: partial stream → null, complete → parsed, flush throws for malformed
- JSON extractor single: complete, incremental, fence-wrapped, malformed

**Verification**:
```bash
npx tsx src/shared/utilities.test.ts
```

**Dependencies**: U2 (schemas)

---

### U4: DO Pipeline (Effect.gen Orchestration)

**Goal**: Rewrite the 4-step analysis pipeline as a Durable Object class using full EffectJS (services, layers, typed errors). Each step is an `Effect.gen` block. DeepSeek calls go through the `ai` SDK (`streamText` / `generateText`) with `ai-gateway-provider` wrapping the `fact-checker` gateway. Progress events are emitted via SSE through the DO's `fetch` handler.

**Files**:
- Create: `src/do/pipeline.ts` — AnalysisPipelineDO class with EffectJS pipeline
- Create: `src/do/ai-client.ts` — Effect service wrapping AI SDK + gateway provider
- Create: `src/do/pipeline.test.ts` — tests with mocked AI SDK

**Patterns to follow**: 
- Cloudflare Durable Object API (`fetch()` handler, `this.ctx.storage`)
- AI SDK: `streamText({ model: gatewayProvider(...), messages, ... })` for step 1
- AI SDK: `generateText(...)` for steps 2 and 3
- Effect.gen for step orchestration with typed error channels
- Effect services: `DeepSeekClient` Context.Tag with `streamText` / `generateText` methods
- `Schema.decodeUnknownEither` for LLM output validation
- `Effect.forEach(..., { concurrency: 'unbounded' })` for parallel step 3 scoring
- Current pipeline logic from `src/pipeline.ts` as reference
- DO receives `CF_AIG_TOKEN` via `this.env.CF_AIG_TOKEN` secret binding

**Test scenarios**:
- Happy path: full 4-step pipeline produces valid AnalysisResult
- Step 1 extracts statements from sample text, streaming yields incremental results
- Step 2 identifies relations, fallacies, cycles
- Step 3 scores all statements in parallel (via `Effect.forEach(..., { concurrency: 'unbounded' })`)
- Partial failure: step 2 fails → step 1 results still returned
- Invalid LLM output: Schema decode failure → typed error in Effect channel
- Cancellation: request.signal.aborted → DO aborts in-flight AI call

**Verification**:
```bash
npx tsx src/do/pipeline.test.ts
```

**Dependencies**: U2, U3

---

### U5: Worker HTTP Layer

**Goal**: Worker fetch handler that routes requests: static assets passthrough, `POST /api/analyze` creates a DO instance, `GET /api/analyze/:id/stream` relays SSE from the DO.

**Files**:
- Create: `src/worker.ts` — `export default { fetch }` with EffectJS routing
- Create: `src/worker.test.ts` — tests using `SELF.fetch()` or mock DO

**Patterns to follow**:
- Cloudflare Workers Static Assets (SPA mode with `not_found_handling: "single-page-application"`)
- DO binding: `env.ANALYSIS_DO` via `this.env.ANALYSIS_DO.idFromName(id).get(...)`
- SSE relay: DO returns `text/event-stream`, Worker pipes it through

**Test scenarios**:
- GET `/` → returns `index.html` from static assets
- GET `/assets/main.js` → returns hashed JS file
- POST `/api/analyze` with `{ text: "..." }` → returns `{ analysisId: "..." }`, DO created
- GET `/api/analyze/:id/stream` → returns SSE stream, events arrive as DO processes
- POST `/api/analyze` with empty body → returns 400

**Verification**:
```bash
npx wrangler dev  # manual curl tests
```

**Dependencies**: U4 (DO pipeline)

---

### U6: Client Update

**Goal**: Remove all API key handling from the client. Replace `analyzeArgument()` call with `fetch('/api/analyze')` + `EventSource('/api/analyze/:id/stream')` for SSE progress. Effect/Schema types replace Zod types in client code.

**Files**:
- Modify: `src/client/App.tsx` — remove API key state, provider settings, ApiSettings
- Modify: `src/client/components/InputPanel.tsx` — remove API key input, remove provider selector, remove model selector, remove Settings button
- Remove: `src/client/components/SettingsPanel.tsx` — no longer needed
- Remove: `src/client/hooks/useLocalStorage.ts` — no longer needed (or keep for theme)
- Modify: `src/client/api.ts` → replace with `analyze()` and `streamAnalysis()` functions
- Update: `src/client/types.ts` — import from shared schemas instead of Zod

**Patterns to follow**: Current App.tsx pipeline lifecycle, EventSource API for SSE consumption

**Test scenarios**:
- Happy path: submit text → receives analysisId → SSE events → graph renders incrementally
- Error path: API returns error → error message shown in UI
- Partial: step 2 fails → step 1 statements displayed, error badge shown
- Theme toggle still works (kept localStorage if needed)

**Verification**:
```bash
npm run dev  # manual browser test with sample argument text
```

**Dependencies**: U5 (Worker), U2 (shared schemas)

---

### U7: Build & Production Wiring

**Goal**: Ensure Vite builds the client into `dist/`, Wrangler deploys Worker + DO + static assets together, and CI is updated.

**Files**:
- Modify: `vite.config.ts` — output to `dist/`, remove GitHub Pages base path
- Modify: `wrangler.jsonc` — finalize with DO binding, CF_AIG_TOKEN secret, asset config
- Add: CI pre-deploy validation — check that CF_AIG_TOKEN secret is set via `wrangler secret list`
- Modify: `package.json` — `npm run dev` = `wrangler dev`, `npm run deploy` = `npm run build && wrangler deploy`
- Modify: `.github/workflows/deploy.yml` — `wrangler deploy` instead of GitHub Pages

**Test scenarios**:
- `npm run build` → `dist/` contains index.html, JS bundles, CSS
- `npm run dev` → wrangler dev starts, serves app at localhost:8787
- `npm run deploy` → deploys to Cloudflare (manual verify via browser)

**Verification**:
```bash
npm run build && npm run deploy  # production deploy
```

**Dependencies**: U1, U2, U3, U4, U5, U6

---

## What You (The User) Need to Prepare

### Already Done ✅
- AI Gateway `fact-checker` created with DeepSeek API key (BYOK)
- Cloudflare account `unendlicherping` with full permissions
- Wrangler OAuth token (workers:write, ai:write, secrets_store:write)

### Need Before U4 (DO Pipeline)
1. **`CF_AIG_TOKEN`** — Create an AI Gateway API token for local dev:
   ```bash
   # Create token with AI Gateway access:
   # Dashboard → Manage Account → API Tokens → Create Token
   # Template: "AI Gateway" with Edit permission on the fact-checker gateway
   #
   # Then add to .dev.vars:
   echo "CF_AIG_TOKEN=your-token-here" > .dev.vars
   ```

2. **Verify gateway connectivity** (optional but recommended):
   ```bash
   curl -H "cf-aig-authorization: Bearer $CF_AIG_TOKEN" \
     https://gateway.ai.cloudflare.com/v1/ce6ed2c0c296f91487c51bff4c8133e0/fact-checker/deepseek/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"Hello"}]}'
   ```

### Need Before U7 (Deploy)
3. **Wrangler secret** — Set `CF_AIG_TOKEN` in production:
   ```bash
   npx wrangler secret put CF_AIG_TOKEN
   ```

### Not Needed
- DeepSeek API key in browser (handled by AI Gateway BYOK)
- Workers AI binding (we use AI SDK + gateway provider, not `env.AI`)
- Separate backend server (Worker + DO is the entire backend)

## Verification Strategy

| Layer | Strategy |
|-------|----------|
| **Shared schemas** | `npx tsx src/shared/schemas.test.ts` — unit tests for validation |
| **Shared utilities** | `npx tsx src/shared/utilities.test.ts` — ported from scripts/verify-e2e.ts |
| **DO pipeline** | `npx tsx src/do/pipeline.test.ts` — mocked env.AI, real Effect pipeline |
| **Worker routing** | `npx wrangler dev` + manual curl / browser testing |
| **Client** | `npm run dev` + manual browser testing with sample arguments |
| **Full E2E** | `npm run dev` → browser submits text → graph renders → side panel works |
