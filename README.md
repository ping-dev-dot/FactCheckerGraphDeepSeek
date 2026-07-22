# 🧠 FactCheckerGraphDeepSeek

**Decompose argumentative text into atomic statements, map logical relationships as an interactive graph, and detect fallacies & circular reasoning — powered by DeepSeek.**

[![Deploy to GitHub Pages](https://github.com/HoodieRocks/FactCheckerGraphDeepSeek/actions/workflows/deploy.yml/badge.svg)](https://github.com/HoodieRocks/FactCheckerGraphDeepSeek/actions/workflows/deploy.yml)

## What It Does

1. **Paste an argument** — anything from a political debate snippet to a philosophical syllogism
2. **DeepSeek analyzes it** via a multi-step streaming pipeline — statements appear live as they're extracted, then relations, fallacies, and cycles fill in
3. **Explore the graph** — click nodes to see speaker attribution, incoming/outgoing relations, fallacy flags, and circular reasoning cycles

### Example outputs

| Input | What You Get |
|-------|--------------|
| A valid deductive argument (e.g., modus ponens) | Clean implication chain with low fact-check difficulty |
| Multi-speaker debate (Alice vs Bob on climate policy) | Speaker-colored nodes, contradiction relations detected, cycle in circular justifications |
| Circular reasoning | Detected cycle highlighted in purple with animated edge |
| A fallacious argument (ad hominem, straw man, false dilemma) | Each fallacy flagged on its statement with type and explanation |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI** | React 19, Tailwind CSS 4 |
| **Graph** | [ReactFlow](https://reactflow.dev/) (`@xyflow/react`) + [dagre](https://github.com/dagrejs/dagre) layout |
| **Validation** | [Zod](https://zod.dev/) — runtime schema checking on every API response |
| **AI** | [DeepSeek Chat API](https://api.deepseek.com/chat/completions) (`deepseek-chat` model) |
| **Build** | Vite 8, TypeScript 6 |
| **Deploy** | GitHub Pages via Actions |

## Quick Start

### Prerequisites
- **Node.js** ≥ 20
- A **DeepSeek API key** ([get one here](https://platform.deepseek.com/api_keys))

### Run locally

```bash
git clone https://github.com/HoodieRocks/FactCheckerGraphDeepSeek.git
cd FactCheckerGraphDeepSeek
npm install
npm run dev
```

Open `http://localhost:5173/FactCheckerGraphDeepSeek/`, paste your API key, enter an argument, and click **Analyze Argument**.

### Build for production

```bash
npm run build     # runs tsc + vite build
npm run preview   # preview the production build locally
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  App.tsx (orchestrator — all state lives here)          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ InputPanel    │  │ GraphCanvas  │  │ DetailSidebar │ │
│  │ (left panel)  │  │ (center)     │  │ (right panel) │ │
│  │              │  │              │  │               │ │
│  │ • API key    │  │ • ReactFlow  │  │ • Statement   │ │
│  │ • Presets    │  │ • dagre      │  │   details     │ │
│  │ • Text area  │  │   auto-      │  │ • Fallacies   │ │
│  │ • Submit     │  │   layout     │  │ • Cycles      │ │
│  └──────┬───────┘  └──────┬───────┘  │ • Relations   │ │
│         │                 │           │ • Speaker     │ │
│         │          ┌──────┴──────┐    └───────────────┘ │
│         └─────────→│  pipeline.ts│                       │
│                    │ (multi-step │                       │
│                    │  orchestrator)                      │
│                    └──────┬──────┘                       │
│                           │                              │
│                    ┌──────┴──────┐                       │
│                    │  streaming.ts│                      │
│                    │  (SSE client)│                      │
│                    └──────┬──────┘                       │
│                           │                              │
│                    ┌──────┴──────┐                       │
│                    │ DeepSeek API│                       │
│                    └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### Multi-step pipeline

The analysis runs in 4 stages with live streaming feedback:

```
User submits text
  │
  ▼
Step 0: Preprocessing (client-side)
  └─ detectSpeakers() — identifies named/role-based/unnamed speakers
  └─ chunkText() — splits long texts at sentence boundaries
  │
  ▼
Step 1: Statement Extraction (streaming)
  └─ DeepSeek streams atomic propositions via SSE
  └─ Each statement: self-contained claim + speakerId + difficulty
  └─ UI: nodes appear in real time as they arrive
  └─ Post-processor catches any missed conclusion markers ("therefore", "thus")
  │
  ▼
Step 2: Relation & Fallacy Analysis (streaming)
  └─ DeepSeek analyzes the finalized statement list
  └─ Streams relations, fallacies, and cycles with live counts
  └─ UI: edges appear progressively as relations are found
  │
  ▼
Step 3: Fact-Check Scoring (batched per statement)
  └─ Each statement scored for verifiability
  └─ UI: difficulty bars update as scores arrive
```

**Each step fails independently** — if step 2 fails, you still see all statements. Partial results are always surfaced.

### Key design decisions

- **Multi-step streaming pipeline**: Statements stream via SSE (users see results immediately), relations/fallacies/cycles stream with live counts, fact-check scores batch in. Total time ~20s for a complex debate.
- **Self-contained propositions**: Statements are atomic logical claims, not meta-reports. Never "Speaker X disagrees with Y" — instead "Y is wrong" with `speakerId: X`. Every statement passes the "flashcard test" (understandable in complete isolation).
- **Speaker attribution**: Regex-based detection identifies named speakers (Alice:, Bob said:), roles (Interviewer:, Host:), and unnamed speakers (Speaker_A, Speaker_B). Each statement gets a `speakerId` and nodes show colored speaker badges.
- **Multi-strategy JSON extraction**: The parser tries direct parse → markdown fence → brace matching, in that order. Real LLM outputs vary wildly.
- **Zod as the contract**: `AnalysisResultSchema` defines the exact shape the LLM must return. Malformed responses fail validation and surface as user-facing errors instead of crashing.
- **dagre for deterministic layout**: A layered top-to-bottom graph layout (`rankdir: "TB"`) with configurable spacing.
- **Custom ReactFlow node/edge types**: `StatementNode` shows speaker badge, fact-check difficulty bar, and fallacy/cycle badges. `ArgumentEdge` applies a purple glow + dash animation to cycle edges.
- **Catppuccin Mocha dark theme**: Consistent color palette throughout.
- **API key in localStorage**: Persisted across sessions via `useLocalStorage`.

### Design philosophy: minimal surface, maximal depth

We follow a **Figma-like approach to UI complexity**: the default view should feel almost barren — just the graph and a subtle input panel. Everything else lives behind progressive disclosure:

- **Click a node** → a slide-out sidebar reveals fallacies, cycles, relations, speaker, and fact-check difficulty — then disappears when you click away
- **Errors** → inline notifications that can be dismissed, not persistent banners
- **Presets** → tucked into a dropdown that pre-fills the text area, never crowding the main view
- **Controls & minimap** → ReactFlow's built-in overlays, unobtrusive by default
- **Progress indicator** → live stage tracker with statement/relation counts, replaces the old spinner, auto-dismisses

The rule: **every feature must earn its pixels**. A new user should see a graph and one clear call to action — nothing else.

### Project structure

```
src/
├── App.tsx                              # Orchestrator — state, handlers, layout
├── api.ts                               # Legacy wrapper + pipeline exports
├── pipeline.ts                          # Multi-step orchestrator (preprocess → extract → analyze → score)
├── streaming.ts                         # SSE streaming client with reconnect + backoff
├── bufferedJsonExtractor.ts             # Incremental JSON parser (partial → wait, malformed → error)
├── prompts.ts                           # All system prompts (legacy + step 1/2/3)
├── speakerDetection.ts                  # Regex-based speaker detection + text segmentation
├── textChunking.ts                      # Token estimation + sentence-boundary chunking
├── types.ts                             # Zod schemas, TS types, color helpers, constants
├── presets.ts                           # Four demo arguments (deductive, multi-speaker, circular, fallacious)
├── index.css                            # Tailwind + custom scrollbar + ReactFlow overrides
├── main.tsx                             # Entry point
├── components/
│   ├── GraphCanvas.tsx                   # ReactFlow + dagre layout (accepts partial results)
│   ├── InputPanel.tsx                    # API key, preset selector, text area, submit
│   ├── StatementNode.tsx                 # Custom node with speaker badge, difficulty bar, badges
│   ├── ArgumentEdge.tsx                  # Custom edge with cycle glow + animation
│   ├── DetailSidebar.tsx                 # Right sidebar (statement detail, fallacies, cycles, speaker)
│   └── PipelineProgress.tsx              # Live progress indicator during pipeline execution
└── hooks/
    └── useLocalStorage.ts                # Generic localStorage hook
```

## Limitations & Known Issues

> ⚠️ **This is an early-stage product.** Expect rough edges.

- **No retry logic** — transient API failures (rate limits, 5xx) are not retried in streaming mode
- **4096 token cap** — large arguments may be truncated by `max_tokens`. Chunking exists but is basic.
- **dagre is deprecated** — should migrate to `@dagrejs/dagre` (the maintained fork)
- **No tests** — zero test framework coverage. E2E verification scripts exist in `scripts/` but no unit test suite.
- **No React error boundary** — a rendering error in one component can take down the whole app
- **API key in browser** — the key is sent directly from the client to DeepSeek. A proxy backend is planned.
- **Type assertion in StatementNode** — `data as unknown as StatementNodeData` is a workaround

## Roadmap

- [ ] **Backend migration** — proxy API key, add user history, sharing, accounts
- [ ] **Improved processing pipeline** — chunking for large inputs, streaming responses
- [ ] **Live transcript input** — feed text from live audio transcripts for real-time analysis
- [ ] **Fact-check integration** — hook into [Brave's LLM Context API](https://brave.com/search/api/) for actual fact verification
- [ ] **UI/UX refinement** — polish the graph interaction, mobile experience, accessibility
- [ ] **Migrate to `@dagrejs/dagre`** — replace deprecated dagre with the maintained fork
- [ ] **Add tests** — at minimum for JSON extraction, Zod validation, speaker detection, and chunking
- [ ] **Add React error boundary** — graceful failure instead of white screen
- [ ] **Retry with backoff** — handle rate limits and transient errors

## Running tests

```bash
npx tsx scripts/verify-e2e.ts              # Unit tests (speaker detection, chunking, JSON parsing, types)
npx tsx scripts/verify-pipeline-e2e.ts     # Full pipeline E2E (requires .api-key file)
```

## Contributing

See [AGENTS.md](./AGENTS.md) for AI coding assistant instructions.

### Quick guidelines
1. **Don't edit the system prompts in `src/prompts.ts` without careful thought** — they're the core contract with the LLM
2. Keep the Zod schemas (`src/types.ts`) in sync with any prompt changes
3. Test JSON extraction with real LLM outputs — they're messier than you expect
4. Prefer the Catppuccin Mocha palette for UI changes
5. Follow the design philosophy: hide complexity, the graph is the hero

## License

MIT
