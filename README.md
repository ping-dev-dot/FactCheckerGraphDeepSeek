# 🧠 FactCheckerGraphDeepSeek

**Decompose argumentative text into atomic statements, map logical relationships as an interactive graph, detect fallacies & circular reasoning, and fact-check claims against live web sources — powered by DeepSeek and Brave Search.**

[![Deploy to GitHub Pages](https://github.com/HoodieRocks/FactCheckerGraphDeepSeek/actions/workflows/deploy.yml/badge.svg)](https://github.com/HoodieRocks/FactCheckerGraphDeepSeek/actions/workflows/deploy.yml)

## What It Does

1. **Paste an argument** — anything from a political debate snippet to a philosophical syllogism
2. **DeepSeek analyzes it** via a multi-step streaming pipeline — statements appear live, then relations, fallacies, and cycles fill in
3. **Optional web fact-checking** — with a Brave Search API key, each statement is verified against real web sources with confidence scores
4. **Explore the graph** — click nodes to see speaker attribution, source evaluations, fallacy flags, and circular reasoning cycles

### Example outputs

| Input | What You Get |
|-------|--------------|
| A valid deductive argument (e.g., modus ponens) | Clean implication chain with low fact-check difficulty |
| Multi-speaker debate (Alice vs Bob on climate policy) | Speaker-colored nodes, contradiction relations, and confidence scores from web fact-checking |
| Circular reasoning | Detected cycle highlighted in purple with animated edge |
| A fallacious argument (ad hominem, straw man, false dilemma) | Each fallacy flagged with type and explanation |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI** | React 19, Tailwind CSS 4 |
| **Graph** | [ReactFlow](https://reactflow.dev/) (`@xyflow/react`) + [dagre](https://github.com/dagrejs/dagre) layout |
| **Validation** | [Zod](https://zod.dev/) — runtime schema checking on every API response |
| **Statement extraction** | [DeepSeek Chat API](https://api.deepseek.com/chat/completions) (`deepseek-chat` model) |
| **Web fact-checking** | [Brave LLM Context API](https://brave.com/search/api/) + DeepSeek source evaluation |
| **Build** | Vite 8, TypeScript 6 |
| **Deploy** | GitHub Pages via Actions |

## Quick Start

### Prerequisites
- **Node.js** ≥ 20
- A **DeepSeek API key** ([get one here](https://platform.deepseek.com/api_keys))
- (Optional) A **Brave Search API key** ([get one here](https://api.search.brave.com)) for web fact-checking

### Run locally

```bash
git clone https://github.com/HoodieRocks/FactCheckerGraphDeepSeek.git
cd FactCheckerGraphDeepSeek
npm install
npm run dev
```

Open `http://localhost:5173/FactCheckerGraphDeepSeek/`, paste your API key(s), enter an argument, and click **Analyze Argument**.

### Build for production

```bash
npm run build     # runs tsc + vite build
npm run preview   # preview the production build locally
```

## Architecture

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
  │
  ▼
Step 2: Relation & Fallacy Analysis (streaming)
  └─ DeepSeek analyzes the finalized statement list
  └─ UI: edges appear progressively with live counts
  │
  ▼
Step 3: Fact-Check Scoring (batched per statement)
  └─ Each statement scored for verifiability
  │
  ▼
Step 4: Web Fact-Checking (optional, opt-in)
  └─ Only runs when a Brave Search API key is provided
  └─ Brave LLM Context API → DeepSeek evaluates each source
  └─ UI: live progress in sidebar, confidence scores on nodes
```

**Each step fails independently** — if step 2 fails, you still see all statements. Partial results are always surfaced.

### Key design decisions

- **Multi-step streaming pipeline**: Statements stream via SSE, relations stream with live counts, confidence bars flip on fact-check completion.
- **Self-contained propositions**: Statements are atomic logical claims, not meta-reports. Every statement passes the "flashcard test" (understandable in complete isolation).
- **Speaker attribution**: Regex-based detection identifies named speakers, roles, and unnamed speakers. Nodes show colored speaker badges.
- **Web fact-checking (Brave API)**: Each statement gets two search queries (prove + disprove). Sources are evaluated in parallel by DeepSeek. Results appear live in the sidebar and confidence scores replace difficulty bars on nodes.
- **Multi-strategy JSON extraction**: The parser tries direct parse → markdown fence → brace matching, in that order.
- **Zod as the contract**: `AnalysisResultSchema` defines the exact shape the LLM must return.
- **Custom ReactFlow nodes**: `StatementNode` shows speaker badge, confidence/difficulty bar, and fallacy/cycle badges. `ArgumentEdge` applies purple glow + animation to cycle edges.
- **Catppuccin Mocha dark theme**: Consistent color palette throughout.
- **Vite dev proxy**: Brave API calls are proxied through Vite in development to avoid CORS restrictions.

### Design philosophy: minimal surface, maximal depth

We follow a **Figma-like approach to UI complexity**: the default view should feel almost barren. Everything else lives behind progressive disclosure:

- **Click a node** → sidebar reveals fallacies, cycles, relations, speaker, and fact-check results
- **Errors** → dismissible inline notifications, not persistent banners
- **Presets** → hidden in a dropdown
- **Progress** → live stage tracker with counts, auto-dismisses
- **Fact-checking** → no global loading; only the sidebar's fact-check section shows progress

### Project structure

```
src/
├── App.tsx                              # Orchestrator — state, handlers, layout
├── api.ts                               # Legacy wrapper + pipeline exports
├── pipeline.ts                          # Multi-step orchestrator (steps 0-4)
├── streaming.ts                         # SSE streaming client with reconnect + backoff
├── bufferedJsonExtractor.ts             # Incremental JSON parser
├── braveSearch.ts                       # Brave LLM Context API client (Vite proxy for CORS)
├── factCheck.ts                         # Fact-check orchestrator: terms → search → eval → verdict
├── prompts.ts                           # All system prompts (legacy + steps 1/2/3/4)
├── speakerDetection.ts                  # Regex-based speaker detection + text segmentation
├── textChunking.ts                      # Token estimation + sentence-boundary chunking
├── types.ts                             # Zod schemas, TS types, color helpers, speaker colors
├── presets.ts                           # Four demo argument presets
├── components/
│   ├── GraphCanvas.tsx                   # ReactFlow + dagre layout (partial results, confidence colors)
│   ├── InputPanel.tsx                    # API key, Brave key, preset selector, text area, submit
│   ├── StatementNode.tsx                 # Custom node with speaker badge, confidence/difficulty bar, badges
│   ├── ArgumentEdge.tsx                  # Custom edge with cycle glow + animation
│   ├── DetailSidebar.tsx                 # Right sidebar — details, fallacies, cycles, fact-check progress
│   └── PipelineProgress.tsx              # Live progress indicator (steps 1-3)
└── hooks/
    └── useLocalStorage.ts                # Generic localStorage hook
```

## Limitations & Known Issues

- **Brave API CORS**: Brave does not allow browser requests. The Vite proxy routes `/api/brave` → `api.search.brave.com` in development. Fact-checking won't work on GitHub Pages until a backend proxy is added.
- **No retry logic** — transient API failures are not retried in streaming mode
- **4096 token cap** — large arguments may be truncated
- **dagre is deprecated** — should migrate to `@dagrejs/dagre`
- **No test framework** — E2E verification scripts exist in `scripts/` but no unit test suite
- **No React error boundary** — a crash in any component takes down the whole app
- **API keys in browser** — a proxy backend is planned
- **Type assertion in StatementNode** — `data as unknown as StatementNodeData` is a workaround

## Running tests

```bash
npx tsx scripts/verify-e2e.ts              # Unit tests (speaker, chunking, JSON, types) — 41 tests
npx tsx scripts/verify-pipeline-e2e.ts     # Full pipeline E2E (requires .api-key) — 18 tests
npx tsx scripts/verify-factcheck-e2e.ts    # Fact-check E2E (requires Brave key) — 24 tests
npx tsx scripts/verify-frontend-flow.ts    # App.tsx state simulation — 15 tests
```

## Contributing

See [AGENTS.md](./AGENTS.md) for AI coding assistant instructions.

### Quick guidelines
1. **Don't edit prompts in `src/prompts.ts` without approval** — they're the core contract with the LLM
2. Keep Zod schemas in sync with prompt changes
3. Test JSON extraction with real LLM outputs
4. Follow the Catppuccin Mocha palette
5. Hide complexity behind interactions — the graph is the hero

## License

MIT
