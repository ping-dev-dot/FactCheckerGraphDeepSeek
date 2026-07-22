# AGENTS.md — AI Coding Assistant Instructions

> **Project**: FactCheckerGraphDeepSeek — Argument graph analyzer powered by DeepSeek + Brave Search
> **Stack**: React 19, TypeScript 6, Vite 8, Tailwind 4, ReactFlow, dagre, Zod
> **Deploy**: GitHub Pages via Actions (branch: `master`)

---

## ⚠️ Critical Rule

**DO NOT edit the system prompts in `src/prompts.ts` without explicit user approval.** The prompts are carefully tuned contracts with the LLM. Even small phrasing changes can break the JSON extraction pipeline, cause validation failures, or produce nonsensical graph output. If you think a prompt needs a change, explain why and ask first.

---

## Project Overview

This is a **single-page web application** that:

1. Takes argumentative text from the user
2. Runs a **multi-step streaming pipeline** against DeepSeek's chat API:
   - **Step 0**: Speaker detection + text chunking (client-side)
   - **Step 1**: Statement extraction via SSE streaming — nodes appear live
   - **Step 2**: Relation/fallacy/cycle analysis — edges appear progressively
   - **Step 3**: Fact-check difficulty scoring per statement
   - **Step 4**: Web fact-checking via Brave LLM Context API (optional, opt-in)
3. Each step can fail independently — partial results are always surfaced to the UI
4. Renders an interactive argument graph using ReactFlow + dagre auto-layout
5. Shows statement details, speaker attribution, fallacies, cycles, and live fact-check results on node click

The app is **currently client-side only** — the DeepSeek API key is sent directly from the browser. A backend migration is planned. Brave API calls are proxied through Vite in development to avoid CORS.

---

## Design Philosophy: Minimal Surface, Maximal Depth

This project follows a **Figma-like approach to UI complexity**. The default view should feel almost empty. Every feature earns its pixels through progressive disclosure:

- **Popups and slide-outs over persistent panels.** The detail sidebar slides in on node click and dismisses on click-away. Errors are dismissible inline notifications, not persistent banners. Presets are hidden in a dropdown. If you're adding UI, ask: "can this live behind a click, hover, or toggle?"
- **Don't sacrifice features — hide them.** A feature-rich app should still feel simple to a first-time user. The complexity budget is spent on demand, not up front.
- **The graph is the hero.** The argument graph is the primary artifact. Controls, sidebars, and badges are secondary furniture. Chrome must never compete with content.
- **Step 4 runs silently in background**: No global loading. The graph is fully interactive immediately after steps 1-3. Only the DetailSidebar shows per-statement fact-check progress.
- **The litmus test:** a brand-new user should see a graph and one clear call to action — nothing else. Everything beyond that is discovered, not presented.

When adding features, follow this decision tree:
1. Can it live in the existing sidebar (behind a node click)? → put it there
2. Can it be a tooltip or hover state? → use that
3. Can it be a collapsible section within an existing panel? → add a toggle
4. Does it truly need persistent screen real estate? → only then add a new panel/banner

---

## File Map & Responsibilities

| File | Role | Edit Safely? |
|------|------|-------------|
| `src/prompts.ts` | All system prompts (legacy + step 1/2/3 extraction, relations, scoring, step 4 fact-check) | ⚠️ **Prompt edits require approval** |
| `src/pipeline.ts` | Multi-step orchestrator: preprocess → extract → analyze → score → fact-check. Post-processes missed conclusions. | ✅ Core logic — test thoroughly |
| `src/streaming.ts` | SSE streaming client for DeepSeek API with reconnect + backoff | ✅ |
| `src/bufferedJsonExtractor.ts` | Incremental JSON parser — handles partial streams, NDJSON arrays, malformed detection | ✅ |
| `src/speakerDetection.ts` | Regex-based speaker detection + text segmentation | ✅ |
| `src/textChunking.ts` | Token estimation + sentence-boundary chunking with context preambles | ✅ |
| `src/braveSearch.ts` | Brave LLM Context API client — GET with 15s timeout, retry on 429, CORS proxy detection | ✅ |
| `src/factCheck.ts` | Fact-check orchestrator — batched search terms, parallel searches/evals, verdict compilation | ✅ |
| `src/types.ts` | Zod schemas, TS types, color helpers, speaker colors, pipeline types, fact-check types | ✅ Must stay in sync with prompts |
| `src/api.ts` | Legacy `analyzeArgument()` wrapper + pipeline re-exports | ✅ |
| `src/App.tsx` | Top-level orchestrator — state, handlers, pipeline callbacks, three-panel layout, fact-check state | ✅ |
| `src/components/InputPanel.tsx` | Left panel — DeepSeek API key, Brave API key, preset selector, text area, submit button | ✅ |
| `src/components/GraphCanvas.tsx` | Center — ReactFlow + dagre layout. Accepts `PartialAnalysisResult` and `factCheckVerdicts` for confidence colors | ✅ |
| `src/components/StatementNode.tsx` | Custom node — speaker badge, confidence/difficulty bar, fallacy/cycle badges | ✅ |
| `src/components/ArgumentEdge.tsx` | Custom edge — cycle glow + dash animation | ✅ |
| `src/components/DetailSidebar.tsx` | Right panel — statement detail, fallacies, cycles, relations, speaker info, live fact-check progress + verdict card | ✅ |
| `src/components/PipelineProgress.tsx` | Live progress indicator — stage icons, statement count, progress bar, error recovery (steps 1-3 only) | ✅ |
| `src/presets.ts` | Four demo argument presets (deductive, multi-speaker, circular, fallacious) | ✅ |
| `src/hooks/useLocalStorage.ts` | Generic localStorage persistence hook (API key, Brave key) | ✅ |
| `src/index.css` | Tailwind import + custom scrollbar + ReactFlow overrides + cycle animation | ✅ |
| `.github/workflows/deploy.yml` | GitHub Actions: build + deploy to GitHub Pages on push to `master` | ✅ |
| `vite.config.ts` | Vite config with Brave API proxy for CORS avoidance | ✅ |

---

## Architecture Rules

### 1. The Zod Schema Is the Contract

`AnalysisResultSchema` in `src/types.ts` defines the exact shape the LLM must return. Malformed responses are caught before rendering. The schema includes optional `factCheckResult` and `factCheckSources` fields on statements.

**When editing**: if you change any system prompt to produce different output, you **must** update the schema to match.

### 2. JSON Extraction Pipeline

The `extractJson()` function tries three strategies in order: direct parse → markdown fence → brace matching. The `bufferedJsonExtractor.ts` adds incremental parsing. **Note**: `factCheck.ts` has a duplicate `extractJson` that should be consolidated into a shared utility.

### 3. Data Flow

```
User text
  → pipeline.ts Step 0: detectSpeakers() + chunkText()
  → pipeline.ts Step 1: streamChatCompletion() → bufferedJsonExtractor (array mode)
      → onStatements() callback → App state → GraphCanvas re-renders nodes
  → pipeline.ts Step 2: streamChatCompletion() → extractPartialRelations/Fallacies/Cycles
      → onPartialResult() callback → App state → GraphCanvas adds edges live
  → pipeline.ts Step 3: chatCompletion() per statement → difficulty scores update
  → pipeline.ts Step 4: runFactCheck() (if Brave key present)
      → onFactCheckProgress() → App state → DetailSidebar shows live progress
      → onStatementFactChecked() → App state → DetailSidebar + StatementNode update
  → Final AnalysisResult → Zod validated → rendered
```

### 4. Fact-Check Data Flow (Step 4)

Fact-check data is stored in **separate React state** in App.tsx:
- `factCheckSources: Record<string, FactCheckSourceEval[]>` — per-statement source evaluations
- `factCheckVerdicts: Record<string, FactCheckVerdict | null>` — per-statement verdicts

This avoids React reference/merge issues. DetailSidebar receives these as direct props, not via deeply nested object traversal. GraphCanvas receives `factCheckVerdicts` for node confidence coloring.

### 5. Statement Rules — Propositions, Not Meta-Reports

The Step 1 prompt enforces:
- Statements are atomic logical propositions — the `speakerId` field carries attribution
- No meta-reports, no dangling references
- Conclusion markers ("therefore", "thus", "so") introduce new claims that MUST be extracted
- Compound decomposition: "X because Y" → two statements
- Client-side post-processor catches missed conclusions

### 6. Brave API Client

`braveSearch.ts` auto-detects browser vs Node.js:
- Browser: uses `/api/brave` path (proxied through Vite dev server)
- Node.js (tests): uses `https://api.search.brave.com` directly

Has 15s timeout, retry on 429 with `Retry-After` header, immediate throw on 401.

---

## Known Sharp Edges

1. **`data as unknown as StatementNodeData`** in `StatementNode.tsx` — a type workaround.
2. **`max_tokens: 4096`** — large arguments can get truncated.
3. **No retry logic** — transient API failures aren't retried in streaming mode.
4. **No React error boundary** — wrap graph and sidebar in error boundaries.
5. **Zero test framework** — E2E scripts exist in `scripts/` but no unit test suite.
6. **API keys exposed** — keys sent from browser. Proxy backend planned.
7. **Partial extraction regexes** — fragile, depend on LLM key ordering.
8. **Conclusion post-processor** — regex anchored to sentence boundaries, edge cases remain.
9. **Step 2 streaming buffer** — can grow large for big relation lists.
10. **Brave API CORS** — API blocks browser requests. Vite proxy handles dev. Production (GitHub Pages) won't have fact-checking until a backend proxy is added.
11. **Duplicate extractJson** — `factCheck.ts` has its own copy. Consolidate into shared utility.
12. **No timeout on DeepSeek source evals** — Brave calls have 15s timeout but DeepSeek source evaluation calls don't.

---

## Future Direction (What We're Building Toward)

1. **Backend migration** — proxy API calls, manage keys, user accounts, history, sharing
2. **Processing pipeline v2** — chunking for large inputs, streaming responses
3. **Live transcript feeding** — real-time text from audio transcripts
4. **Fact-check integration** — already partially done with Brave API; expand and add backend proxy
5. **UI/UX overhaul** — polished mobile experience, better graph interaction, accessibility

### What this means for code changes now:
- **Avoid tight coupling to the client-side-only model**
- **Don't add heavy state management** — prefer React Context over external libraries
- **Keep the Zod schema as the source of truth**
- **Pipeline steps are independent** — don't add hard dependencies between steps

---

## Quick Commands

```bash
npm run dev                              # Start dev server (Brave API proxied through Vite)
npm run build                            # TypeScript check + Vite production build
npm run lint                             # Oxlint
npm run preview                          # Preview production build locally
npx tsx scripts/verify-e2e.ts            # Unit tests (speaker, chunking, JSON, types)
npx tsx scripts/verify-pipeline-e2e.ts   # Full pipeline E2E (requires .api-key)
npx tsx scripts/verify-factcheck-e2e.ts  # Fact-check E2E (requires Brave key)
npx tsx scripts/verify-frontend-flow.ts  # Frontend state simulation test
```

---

## Communication Style

- Be concise — don't explain what the code already says
- Reference files with paths (e.g., `src/pipeline.ts:215`)
- When proposing changes to prompts or schemas, show the diff and explain the reasoning
- If something looks like a bug, flag it but don't fix it without confirming
