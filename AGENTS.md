# AGENTS.md — AI Coding Assistant Instructions

> **Project**: FactCheckerGraphDeepSeek — Argument graph analyzer powered by DeepSeek
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
3. Each step can fail independently — partial results are always surfaced to the UI
4. Renders an interactive argument graph using ReactFlow + dagre auto-layout
5. Shows statement details, speaker attribution, fallacies, and cycles in a sidebar on node click

The app is **currently client-side only** — the DeepSeek API key is sent directly from the browser. A backend migration is planned.

---

## Design Philosophy: Minimal Surface, Maximal Depth

This project follows a **Figma-like approach to UI complexity**. The default view should feel almost empty. Every feature earns its pixels through progressive disclosure:

- **Popups and slide-outs over persistent panels.** The detail sidebar slides in on node click and dismisses on click-away. Errors are dismissible inline notifications, not persistent banners. Presets are hidden in a dropdown. If you're adding UI, ask: "can this live behind a click, hover, or toggle?"
- **Don't sacrifice features — hide them.** A feature-rich app should still feel simple to a first-time user. The complexity budget is spent on demand, not up front.
- **The graph is the hero.** The argument graph is the primary artifact. Controls, sidebars, and badges are secondary furniture. Chrome must never compete with content.
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
| `src/prompts.ts` | All system prompts (legacy + step 1/2/3 extraction, relations, scoring) | ⚠️ **Prompt edits require approval** |
| `src/pipeline.ts` | Multi-step orchestrator: preprocess → extract → analyze → score. Post-processes missed conclusions. | ✅ Core logic — test thoroughly |
| `src/streaming.ts` | SSE streaming client for DeepSeek API with reconnect + backoff | ✅ |
| `src/bufferedJsonExtractor.ts` | Incremental JSON parser — handles partial streams, NDJSON arrays, malformed detection | ✅ |
| `src/speakerDetection.ts` | Regex-based speaker detection + text segmentation | ✅ |
| `src/textChunking.ts` | Token estimation + sentence-boundary chunking with context preambles | ✅ |
| `src/types.ts` | Zod schemas, TS types, color helpers, speaker colors, pipeline types | ✅ Must stay in sync with prompts |
| `src/api.ts` | Legacy `analyzeArgument()` wrapper + pipeline re-exports | ✅ |
| `src/App.tsx` | Top-level orchestrator — state, handlers, pipeline callbacks, three-panel layout | ✅ |
| `src/components/InputPanel.tsx` | Left panel — API key input, preset selector, text area, submit button | ✅ |
| `src/components/GraphCanvas.tsx` | Center — ReactFlow + dagre layout. Accepts `PartialAnalysisResult` for incremental rendering | ✅ |
| `src/components/StatementNode.tsx` | Custom node — speaker badge, difficulty bar, fallacy/cycle badges | ✅ |
| `src/components/ArgumentEdge.tsx` | Custom edge — cycle glow + dash animation | ✅ |
| `src/components/DetailSidebar.tsx` | Right panel — statement detail, fallacies, cycles, relations, speaker info | ✅ |
| `src/components/PipelineProgress.tsx` | Live progress indicator — stage icons, statement count, progress bar, error recovery | ✅ |
| `src/presets.ts` | Four demo argument presets (deductive, multi-speaker, circular, fallacious) | ✅ |
| `src/hooks/useLocalStorage.ts` | Generic localStorage persistence hook (API key) | ✅ |
| `src/index.css` | Tailwind import + custom scrollbar + ReactFlow overrides + cycle animation | ✅ |
| `.github/workflows/deploy.yml` | GitHub Actions: build + deploy to GitHub Pages on push to `master` | ✅ |

---

## Architecture Rules

### 1. The Zod Schema Is the Contract

`AnalysisResultSchema` in `src/types.ts` defines the exact shape the LLM must return. Malformed responses are caught before rendering.

**When editing**: if you change any system prompt to produce different output, you **must** update the schema to match. Otherwise every API response will fail validation.

### 2. JSON Extraction Pipeline

The `extractJson()` function in `src/api.ts` and `src/pipeline.ts` tries three strategies in order:
1. **Direct `JSON.parse()`** — works when the LLM returns clean JSON
2. **Markdown fence regex** — handles ` ```json ... ``` ` wrapping
3. **Brace matching regex** — last resort, finds the first `{...}` pair

The `bufferedJsonExtractor.ts` adds incremental parsing: distinguishes "incomplete" (keep waiting) from "malformed" (real error). In array mode, supports newline-delimited JSON (NDJSON) for streaming statement extraction.

If you encounter extraction failures, **add a strategy** rather than replacing the pipeline.

### 3. Data Flow

```
User text
  → pipeline.ts Step 0: detectSpeakers() + chunkText()
  → pipeline.ts Step 1: streamChatCompletion() → bufferedJsonExtractor (array mode)
      → onStatements() callback → App state → GraphCanvas re-renders nodes
  → pipeline.ts Step 2: streamChatCompletion() → extractPartialRelations/Fallacies/Cycles
      → onPartialResult() callback → App state → GraphCanvas adds edges live
  → pipeline.ts Step 3: chatCompletion() per statement
      → onPartialResult() → difficulty scores update
  → Final AnalysisResult → Zod validated → rendered
```

**Do not skip Zod validation.** The schema is the safety net between an unpredictable LLM and the rendering code.

### 4. Statement Rules — Propositions, Not Meta-Reports

The Step 1 prompt enforces:
- **Statements are atomic logical propositions** — the `speakerId` field carries attribution
- **No meta-reports**: ❌ "Speaker X disagrees with Y" → ✅ "Y is wrong" (`speakerId: X`)
- **No dangling references**: "this", "that premise", "her argument" → resolved to actual content
- **Flashcard test**: every statement must be understandable in complete isolation
- **Conclusion markers**: "therefore", "thus", "so" introduce new claims that MUST be extracted
- **Compound decomposition**: "X because Y" → two statements; "X and Y" → two statements

A client-side post-processor in `pipeline.ts` catches conclusion markers the model might miss.

### 5. Speaker Detection

`speakerDetection.ts` handles:
- Named patterns: `Alice:`, `Bob said:`, `[Alice]`
- Role-based: `Interviewer:`, `Host:`, `Guest:`
- Unnamed speakers: `Speaker_A`, `Speaker_B` by turn order
- False positive filtering for common words (Will, May, However, etc.)

Speakers get Catppuccin-mocha-palette colors. `GraphCanvas.tsx` resolves speaker name + color for each node.

### 6. Graph Layout

- **dagre** computes a layered top-to-bottom layout (`rankdir: "TB"`, `nodesep: 80`, `ranksep: 120`)
- Nodes are 220×120px; dagre positions are centered by offsetting `-110, -60`
- **dagre is deprecated** — migrate to `@dagrejs/dagre` when touching the layout code
- `GraphCanvas` accepts `PartialAnalysisResult` — handles nodes-without-edges gracefully (step 1 complete, step 2 pending)

### 7. Custom Nodes & Edges

- `StatementNode` — shows speaker badge (colored pill), statement ID, text, difficulty gradient bar, fallacy/cycle badges
- `ArgumentEdge` — purple color (`#cba6f7`) + dash animation for cycle edges; gray with arrow for normal

### 8. Theme

Catppuccin Mocha palette throughout:
- Background: `#11111b` (base), `#1e1e2e` (surface), `#181825` (mantle)
- Text: `#cdd6f4` (text), `#a6adc8` (subtext), `#585b70` (overlay)
- Accent: `#89b4fa` (blue), `#a6e3a1` (green), `#f9e2af` (yellow), `#f38ba8` (red), `#cba6f7` (mauve/purple)
- Speaker colors: 7-assigned Catppuccin colors in `types.ts`

Stick to this palette for UI changes.

---

## Known Sharp Edges

1. **`data as unknown as StatementNodeData`** in `StatementNode.tsx` — a type workaround. If you touch ReactFlow types, tighten this properly.
2. **`max_tokens: 4096`** in streaming/pipeline — large arguments can get truncated. Basic chunking exists but isn't battle-tested.
3. **No retry logic** — transient API failures (429, 5xx) aren't retried in streaming mode. The streaming client has basic reconnect (max 3) but no exponential backoff for non-streaming calls.
4. **No React error boundary** — a crash in any component takes down the whole app. Wrap the graph and sidebar in error boundaries.
5. **Zero test framework** — E2E verification scripts exist in `scripts/` but no unit test suite. Highest-priority targets: `extractJson()`, `bufferedJsonExtractor`, `speakerDetection`, `textChunking`, Zod validation.
6. **API key exposed** — the key is sent from the browser. A proxy backend is on the roadmap.
7. **Partial extraction regexes** in pipeline.ts (`extractPartialRelations` etc.) are fragile — they depend on LLM outputting JSON with consistent key ordering. If the model reorders keys, partial extraction silently fails (full parse still works at stream end).
8. **Conclusion post-processor** uses a regex that can theoretically match false positives mid-sentence (currently anchored to sentence boundaries — `^|[.?!]` — but edge cases remain).
9. **Step 2 streaming** yields deltas from DeepSeek, but the buffered JSON extractor accumulates them. For very large relation lists, the buffer can grow substantially. Consider capping or switching to NDJSON for step 2 as well.

---

## Future Direction (What We're Building Toward)

When contributing, align with these planned changes:

1. **Backend migration** — a server to proxy API calls, manage keys, and eventually handle user accounts, history, and sharing
2. **Processing pipeline v2** — chunking for large inputs, streaming responses from the LLM
3. **Live transcript feeding** — accepting real-time text from audio transcripts as input
4. **Fact-check integration** — hooking into [Brave's LLM Context API](https://brave.com/search/api/) for actual claim verification beyond the LLM's training data
5. **UI/UX overhaul** — polished mobile experience, better graph interaction, accessibility

### What this means for code changes now:
- **Avoid tight coupling to the client-side-only model** — if you add features, keep the API call surface small and swappable
- **Don't add heavy state management** — the current `useState` pattern is fine, but if you need more, prefer React Context or a lightweight solution that won't fight a future backend
- **Keep the Zod schema as the source of truth** — when a backend exists, the schema will likely move to a shared package
- **Pipeline steps are independent** — don't add hard dependencies between pipeline steps. Each step should be callable with partial state.

---

## Quick Commands

```bash
npm run dev                              # Start dev server
npm run build                            # TypeScript check + Vite production build
npm run lint                             # Oxlint
npm run preview                          # Preview production build locally
npx tsx scripts/verify-e2e.ts            # Unit tests (speaker, chunking, JSON, types)
npx tsx scripts/verify-pipeline-e2e.ts   # Full pipeline E2E (requires .api-key)
```

---

## Communication Style

- Be concise — don't explain what the code already says
- Reference files with paths (e.g., `src/pipeline.ts:215`)
- When proposing changes to prompts or schemas, show the diff and explain the reasoning
- If something looks like a bug, flag it but don't fix it without confirming
