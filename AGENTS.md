# AGENTS.md — AI Coding Assistant Instructions

> **Project**: FactCheckerGraphDeepSeek — Argument graph analyzer powered by DeepSeek
> **Stack**: React 19, TypeScript 6, Vite 8, Tailwind 4, ReactFlow, dagre, EffectJS, Cloudflare Workers + Durable Objects
> **Deploy**: Cloudflare Workers via Wrangler (branch: `master`)

---

## ⚠️ Critical Rule

**DO NOT edit the system prompts in `src/shared/prompts.ts` without explicit user approval.** The prompts are carefully tuned contracts with the LLM. Even small phrasing changes can break the JSON extraction pipeline, cause validation failures, or produce nonsensical graph output. If you think a prompt needs a change, explain why and ask first.

---

## Project Overview

This is a **full-stack Cloudflare application**:

1. Takes argumentative text from the user
2. Runs a **multi-step streaming pipeline** against DeepSeek via Cloudflare AI Gateway:
   - **Step 0**: Speaker detection + text chunking
   - **Step 1**: Statement extraction via SSE streaming — nodes appear live
   - **Step 2**: Relation/fallacy/cycle analysis
   - **Step 3**: Fact-check difficulty scoring per statement (parallel)
3. Each step can fail independently — partial results are always surfaced to the UI
4. Renders an interactive argument graph using ReactFlow + dagre auto-layout
5. Shows statement details, speaker attribution, fallacies, and cycles in a sidebar on node click

### Architecture

```
Browser (React SPA)
    │  GET /* → static assets from Worker
    │  POST /api/analyze → creates DO, returns analysisId
    │  GET /api/analyze/:id/stream → SSE progress from DO
    ▼
Cloudflare Worker (src/worker.ts)
    │  Static asset serving + API routing to Durable Objects
    ▼
Durable Object (src/do/pipeline.ts, one per analysis)
    │  Orchestrates 4-step pipeline via EffectJS
    │  Calls DeepSeek through AI Gateway (BYOK — no keys in browser)
    │  Streams progress events as SSE to client
    ▼
AI Gateway → DeepSeek
    │  API key stored in Cloudflare Secrets Store / BYOK
    │  AI SDK (@ai-sdk/openai-compatible) for LLM calls
```

---

## Design Philosophy: Minimal Surface, Maximal Depth

This project follows a **Figma-like approach to UI complexity**. The default view should feel almost empty. Every feature earns its pixels through progressive disclosure:

- **Popups and slide-outs over persistent panels.** The detail sidebar slides in on node click and dismisses on click-away. Errors are dismissible inline notifications, not persistent banners. Presets are hidden in a dropdown. If you're adding UI, ask: "can this live behind a click, hover, or toggle?"
- **Don't sacrifice features — hide them.** A feature-rich app should still feel simple to a first-time user. The complexity budget is spent on demand, not up front.
- **The graph is the hero.** The argument graph is the primary artifact. Controls, sidebars, and badges are secondary furniture. Chrome must never compete with content.
- **The litmus test:** a brand-new user should see a graph and one clear call to action — nothing else. Everything beyond that is discovered, not presented.

---

## File Map & Responsibilities

| File | Role | Edit Safely? |
|------|------|-------------|
| `src/shared/prompts.ts` | All system prompts (step 1/2/3 extraction, relations, scoring) | ⚠️ **Prompt edits require approval** |
| `src/shared/schemas.ts` | effect/Schema definitions for runtime validation (DO-only) | ✅ Must stay in sync with prompts |
| `src/shared/types.ts` | Plain TS interfaces — shared by client and DO. **Must NOT import effect or any heavy library** | ✅ |
| `src/shared/speaker-detection.ts` | Regex-based speaker detection + text segmentation | ✅ |
| `src/shared/text-chunking.ts` | Token estimation + sentence-boundary chunking with context preambles | ✅ |
| `src/shared/json-extractor.ts` | Incremental JSON parser — handles partial streams, NDJSON arrays, malformed detection, uses effect/Schema | ✅ |
| `src/shared/id-generator.ts` | Cross-runtime UUID generation (browser crypto + Workers fallback) | ✅ |
| `src/do/pipeline.ts` | **Durable Object class** — SSE handler, orchestrates pipeline steps, progress events | ✅ Core logic |
| `src/do/pipeline-logic.ts` | **Effect-based pipeline functions** — `preprocess()`, `extractStatements()`, `analyzeRelations()`, `scoreStatements()`, `postprocessConclusions()`, `runFullPipeline()` | ✅ Core logic |
| `src/do/ai-client.ts` | Effect service wrapping `@ai-sdk/openai-compatible` + AI Gateway for DeepSeek calls | ✅ |
| `src/do/pipeline.test.ts` | Unit tests for pipeline logic (mock + schema) | ✅ |
| `src/do/pipeline-e2e.test.ts` | **E2E tests against real AI Gateway** — token streaming, formats, all 3 pipeline steps | ✅ |
| `src/worker.ts` | Worker fetch handler — static assets, `POST /api/analyze`, `GET /api/analyze/:id/stream` | ✅ |
| `src/client/App.tsx` | Top-level orchestrator — state, handlers, EventSource SSE consumption | ✅ |
| `src/client/components/InputPanel.tsx` | Left panel — preset selector, text area, submit button (no API key) | ✅ |
| `src/client/components/GraphCanvas.tsx` | Center — ReactFlow + dagre layout | ✅ |
| `src/client/components/StatementNode.tsx` | Custom node — speaker badge, difficulty bar, fallacy/cycle badges | ✅ |
| `src/client/components/ArgumentEdge.tsx` | Custom edge — cycle glow + dash animation | ✅ |
| `src/client/components/DetailSidebar.tsx` | Right panel — statement detail, fallacies, cycles, relations, speaker info | ✅ |
| `src/client/components/PipelineProgress.tsx` | Live progress indicator | ✅ |
| `src/client/presets.ts` | Four demo argument presets | ✅ |
| `src/client/hooks/useLocalStorage.ts` | Generic localStorage persistence hook (theme) | ✅ |
| `src/client/index.css` | Tailwind import + custom scrollbar + ReactFlow overrides + cycle animation | ✅ |
| `wrangler.jsonc` | DO binding, static assets config, compat flags | ✅ |
| `.github/workflows/deploy.yml` | GitHub Actions: build + wrangler deploy | ✅ |

---

## Architecture Rules

### 1. Type Safety — Two Layers

There are **two type layers** with a hard boundary:

- **`src/shared/types.ts`** — Plain TypeScript interfaces with **zero runtime dependencies**. Imported by both client and DO. Must never import `effect`, `zod`, or any heavy library.
- **`src/shared/schemas.ts`** — effect/Schema definitions for runtime validation. **Only imported by DO code.** Provides `Schema.decodeUnknownEither()` for LLM output validation.

**CRITICAL**: Never re-export from `schemas.ts` into `types.ts`. The `import { Schema } from "effect"` in `schemas.ts` will pull the entire effect library into the client bundle, causing white screens. See `docs/solutions/architecture/plain-types-boundary.md`.

### 2. JSON Extraction Pipeline

`src/shared/json-extractor.ts` tries four strategies in order:
1. **Direct `JSON.parse()`** — works when the LLM returns clean JSON
2. **Markdown fence regex** — handles ` ```json ... ``` ` wrapping
3. **Brace matching regex** — finds the first `{...}` pair
4. **Array matching regex** — finds `[...]` for statement arrays

In array mode, supports **newline-delimited JSON (NDJSON)** for streaming statement extraction. Token-by-token chunks from the AI SDK are accumulated until complete lines form.

### 3. Data Flow

```
Browser (POST /api/analyze)
  → Worker: creates DO via idFromName(), stores text via /init
  → Browser (GET /api/analyze/:id/stream via EventSource)
  → Worker: routes to DO's /stream endpoint
  → DO handleSSE():
      Step 0: preprocess(text) → speakers + userMessage
      Step 1: extractStatements(client, userMessage) → streaming via AI SDK
              → emit("statements:update") per batch → EventSource → React state
      Post-process: postprocessConclusions(text, statements)
      Step 2: analyzeRelations(client, statements)
              → emit("step:complete") with relations, fallacies, cycles
      Step 3: scoreStatements(client, statements) → parallel via Effect.forEach
              → emit("pipeline:complete") with full result
      → React state → GraphCanvas re-renders
```

### 4. Statement Rules — Propositions, Not Meta-Reports

The Step 1 prompt enforces:
- **Statements are atomic logical propositions** — the `speakerId` field carries attribution
- **No meta-reports**: ❌ "Speaker X disagrees with Y" → ✅ "Y is wrong" (`speakerId: X`)
- **No dangling references**: "this", "that premise", "her argument" → resolved to actual content
- **Flashcard test**: every statement must be understandable in complete isolation
- **Conclusion markers**: "therefore", "thus", "so" introduce new claims that MUST be extracted
- **Compound decomposition**: "X because Y" → two statements; "X and Y" → two statements

A post-processor in `pipeline-logic.ts` catches conclusion markers the model might miss.

### 5. Speaker Detection

`src/shared/speaker-detection.ts` handles:
- Named patterns: `Alice:`, `Bob said:`, `[Alice]`
- Role-based: `Interviewer:`, `Host:`, `Guest:`
- Unnamed speakers: `Speaker_A`, `Speaker_B` by turn order
- False positive filtering for common words (Will, May, However, etc.)

Speaker text must be on separate lines (`^` anchored pattern). Single-line multi-speaker text only detects the first speaker.

### 6. Graph Layout

- **dagre** computes a layered top-to-bottom layout (`rankdir: "TB"`, `nodesep: 80`, `ranksep: 120`)
- Nodes are 220×120px; dagre positions are centered by offsetting `-110, -60`
- **dagre is deprecated** — migrate to `@dagrejs/dagre` when touching the layout code
- `GraphCanvas` accepts `PartialAnalysisResult` — handles nodes-without-edges gracefully

### 7. Custom Nodes & Edges

- `StatementNode` — shows speaker badge, statement ID, text, difficulty gradient bar, fallacy/cycle badges
- `ArgumentEdge` — purple color (`#cba6f7`) + dash animation for cycle edges; gray with arrow for normal

### 8. Theme

Catppuccin Mocha palette throughout. Stick to this palette for UI changes.

---

## Known Sharp Edges

1. **`types.ts` must stay dependency-free** — never import effect, zod, or any server library into it. See `docs/solutions/architecture/plain-types-boundary.md`.
2. **DO re-processes on reconnect** — if a client disconnects and reconnects, the DO starts the pipeline over. No result caching yet.
3. **No test for DO SSE handler or Worker routing** — tests cover pipeline logic and E2E API calls, but not the HTTP layer.
4. **E2E tests call real AI Gateway** — they consume API credits. Run sparingly. Gate on `CF_AIG_TOKEN` being set.
5. **Partial extraction in step 2 is non-streaming** — the original client-side pipeline streamed step 2 for live relation counts. The DO version uses non-streaming `generateText`. Results appear all at once, not progressively.
6. **Speaker detection requires multi-line input** — speakers must be separated by newlines for detection to work.
7. **dagre is deprecated** — migrate to `@dagrejs/dagre`.

## Future Direction

When contributing, align with these planned changes:

1. **DO result caching** — persist completed results so reconnects don't re-process
2. **Step 2 streaming** — restore progressive relation/fallacy display
3. **Fact-check integration** — hook into external APIs for actual claim verification
4. **User accounts & history** — store past analyses
5. **UI/UX overhaul** — polished mobile experience, better graph interaction, accessibility

## Quick Commands

```bash
npm run dev                          # Start wrangler dev (Worker + static assets)
npm run build                        # Vite production build (client only)
npm run deploy                       # Build + wrangler deploy
npm run lint                         # Oxlint

# Tests
npx tsx src/shared/schemas.test.ts       # 16 tests — effect/Schema validation
npx tsx src/shared/utilities.test.ts     # 47 tests — prompts, speaker, chunking, JSON, ID gen
npx tsx src/do/pipeline.test.ts          # 33 tests — pipeline logic with mock AI
npx tsx src/do/pipeline-e2e.test.ts      # 19 tests — real AI Gateway calls (needs CF_AIG_TOKEN)

# Infrastructure
npx wrangler secret put CF_AIG_TOKEN     # Set AI Gateway token for production
npx wrangler deploy                      # Deploy Worker + DO + assets
npx wrangler tail                        # Stream production logs
```

---

## Communication Style

- Be concise — don't explain what the code already says
- Reference files with paths (e.g., `src/do/pipeline-logic.ts:96`)
- When proposing changes to prompts or schemas, show the diff and explain the reasoning
- If something looks like a bug, flag it but don't fix it without confirming
- **DO NOT import `effect`, `zod`, or any server library into `src/shared/types.ts`** — this causes white screens
