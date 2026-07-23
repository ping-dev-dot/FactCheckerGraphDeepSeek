# 🧠 Argument Graph Analyzer

**Decompose argumentative text into atomic statements, map logical relationships as an interactive graph, and detect fallacies & circular reasoning — powered by DeepSeek via Cloudflare AI Gateway.**

## What It Does

1. **Paste an argument** — anything from a political debate snippet to a philosophical syllogism
2. **DeepSeek analyzes it** via a multi-step streaming pipeline — statements appear live as they're extracted, then relations, fallacies, and cycles fill in
3. **Explore the graph** — click nodes to see speaker attribution, incoming/outgoing relations, fallacy flags, and circular reasoning cycles

### Example outputs

| Input | What You Get |
|-------|--------------|
| A valid deductive argument (e.g., modus ponens) | Clean implication chain with low fact-check difficulty |
| Multi-speaker debate (Alice vs Bob on climate policy) | Speaker-colored nodes, contradiction relations detected |
| Circular reasoning | Detected cycle highlighted in purple with animated edge |
| A fallacious argument (ad hominem, straw man, false dilemma) | Each fallacy flagged on its statement with type and explanation |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Tailwind CSS 4, Vite 8 |
| **Graph** | ReactFlow (`@xyflow/react`) + dagre layout |
| **Backend** | Cloudflare Workers + Durable Objects |
| **Pipeline** | EffectJS — typed errors, structured concurrency, services/layers |
| **AI** | DeepSeek (`deepseek-chat`) via Cloudflare AI Gateway (BYOK) |
| **AI SDK** | Vercel AI SDK (`ai`) + `@ai-sdk/openai-compatible` |
| **Validation** | effect/Schema — runtime validation on every API response |
| **Deploy** | Cloudflare Workers via Wrangler |

## Quick Start

### Prerequisites
- **Node.js** ≥ 20
- A Cloudflare account with:
  - AI Gateway created with DeepSeek API key (BYOK)
  - `CF_AIG_TOKEN` — a Cloudflare API token with AI Gateway access

### Run locally

```bash
git clone https://github.com/HoodieRocks/FactCheckerGraphDeepSeek.git
cd FactCheckerGraphDeepSeek

# Set your AI Gateway token
echo "CF_AIG_TOKEN=your-token-here" > .dev.vars

npm install
npm run dev     # starts wrangler dev on http://localhost:8787
```

No API key needed in the browser — the backend handles all AI Gateway authentication.

### Deploy

```bash
npx wrangler secret put CF_AIG_TOKEN   # one-time: set the gateway token
npm run deploy                          # build + deploy
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ InputPanel    │  │ GraphCanvas  │  │ DetailSidebar     │  │
│  │ • Presets     │  │ • ReactFlow  │  │ • Statement detail│  │
│  │ • Text area   │  │ • dagre      │  │ • Fallacies       │  │
│  │ • Submit      │  │   auto-layout│  │ • Cycles          │  │
│  └──────┬───────┘  └──────────────┘  │ • Relations       │  │
│         │ EventSource SSE             └───────────────────┘  │
└─────────┼────────────────────────────────────────────────────┘
          │ POST /api/analyze → GET /api/analyze/:id/stream
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Worker (src/worker.ts)                           │
│  • Serves React SPA as static assets                         │
│  • Routes /api/* to Durable Object                           │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌─────────────────────┐    ┌──────────────────────────────────┐
│  Durable Object      │    │  AI Gateway → DeepSeek           │
│  (one per analysis)  │    │  • BYOK — key in Secrets Store  │
│                      │    │  • AI SDK for streaming calls    │
│  Step 0: Preprocess  │    │  • @ai-sdk/openai-compatible     │
│  Step 1: Extract     │───▶│    + gateway.deepseek URL         │
│  Step 2: Relations   │    │                                  │
│  Step 3: Score        │    │                                  │
│                      │    │                                  │
│  Progress via SSE ───┼────┼──────────────────────────────▶   │
└─────────────────────┘    └──────────────────────────────────┘
```

### Multi-step pipeline

```
POST /api/analyze { text }
  → Worker creates DO, stores text
  → Browser connects GET /api/analyze/:id/stream (EventSource SSE)

DO processes:
  Step 0: Preprocessing
    └─ detectSpeakers() + build userMessage with speaker context

  Step 1: Statement Extraction (streaming via AI SDK)
    └─ DeepSeek returns NDJSON token-by-token → incremental parse
    └─ UI: nodes appear in real time as they arrive
    └─ Post-processor: catches missed "therefore/thus/so" conclusions

  Step 2: Relation & Fallacy Analysis
    └─ DeepSeek analyzes finalized statement list
    └─ Returns relations, fallacies, cycles
    └─ UI: edges + badges appear

  Step 3: Fact-Check Scoring (parallel via Effect.forEach)
    └─ Each statement scored independently
    └─ UI: difficulty bars update
```

**Each step fails independently** — partial results are always surfaced.

### Project structure

```
src/
├── worker.ts                             # Worker — HTTP routing + static assets
├── do/
│   ├── pipeline.ts                       # Durable Object — SSE handler, orchestrates pipeline
│   ├── pipeline-logic.ts                 # Effect-based pipeline functions + post-processor
│   ├── ai-client.ts                      # AI SDK + Cloudflare AI Gateway wrapper
│   ├── pipeline.test.ts                  # Unit tests (mock AI)
│   └── pipeline-e2e.test.ts              # E2E tests (real AI Gateway calls)
├── shared/
│   ├── types.ts                          # Plain TS interfaces (NO effect/zod imports!)
│   ├── schemas.ts                        # effect/Schema runtime validation (DO-only)
│   ├── prompts.ts                        # System prompts (⚠️ do not edit without approval)
│   ├── speaker-detection.ts              # Regex-based speaker detection
│   ├── text-chunking.ts                  # Token estimation + sentence-boundary chunking
│   ├── json-extractor.ts                 # Incremental JSON parser (NDJSON + streaming)
│   └── id-generator.ts                   # Cross-runtime UUID generation
└── client/
    ├── App.tsx                            # Orchestrator — state, EventSource SSE
    ├── components/
    │   ├── GraphCanvas.tsx                # ReactFlow + dagre
    │   ├── InputPanel.tsx                 # Presets, text area, submit
    │   ├── StatementNode.tsx              # Custom node
    │   ├── ArgumentEdge.tsx               # Custom edge
    │   ├── DetailSidebar.tsx              # Statement details sidebar
    │   └── PipelineProgress.tsx           # Live progress
    ├── presets.ts                         # Demo arguments
    ├── hooks/useLocalStorage.ts           # Theme persistence
    └── main.tsx                           # Entry point
```

## Running tests

```bash
# Unit tests (no API key needed)
npx tsx src/shared/schemas.test.ts       # 16 tests — effect/Schema validation
npx tsx src/shared/utilities.test.ts     # 47 tests — speaker, chunking, JSON, ID gen
npx tsx src/do/pipeline.test.ts          # 33 tests — pipeline logic with mock AI

# E2E tests (requires CF_AIG_TOKEN — calls real DeepSeek)
npx tsx src/do/pipeline-e2e.test.ts      # 19 tests — real token streaming + all 3 steps
```

## Limitations

- **DO re-processes on reconnect** — no result caching yet
- **Speaker detection requires multi-line input** — speakers must be separated by newlines
- **Step 2 is non-streaming** — relations appear all at once, not progressively
- **dagre is deprecated** — should migrate to `@dagrejs/dagre`
- **No user accounts/history** — each analysis is ephemeral

## Contributing

See [AGENTS.md](./AGENTS.md) for AI coding assistant instructions.

### Quick guidelines
1. **Don't edit the system prompts in `src/shared/prompts.ts`** without approval
2. **Never import effect or heavy libraries into `src/shared/types.ts`** — it causes white screens in the client
3. Keep `src/shared/schemas.ts` in sync with any prompt changes
4. Add E2E tests with real API calls for any pipeline changes
5. Prefer the Catppuccin Mocha palette for UI changes
6. Follow the design philosophy: hide complexity, the graph is the hero

## License

MIT
