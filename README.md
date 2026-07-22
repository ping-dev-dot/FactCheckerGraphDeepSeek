# 🧠 FactCheckerGraphDeepSeek

**Decompose argumentative text into atomic statements, map logical relationships as an interactive graph, and detect fallacies & circular reasoning — powered by DeepSeek.**

[![Deploy to GitHub Pages](https://github.com/HoodieRocks/FactCheckerGraphDeepSeek/actions/workflows/deploy.yml/badge.svg)](https://github.com/HoodieRocks/FactCheckerGraphDeepSeek/actions/workflows/deploy.yml)

![Screenshot placeholder — add a screenshot of the app in action]()

## What It Does

1. **Paste an argument** — anything from a political debate snippet to a philosophical syllogism
2. **DeepSeek analyzes it** — breaking it into atomic claims, scoring fact-check difficulty, and mapping logical relationships
3. **Explore the graph** — click nodes to see incoming/outgoing relations, fallacy flags, and circular reasoning cycles

### Example outputs

| Input | What You Get |
|-------|--------------|
| A valid deductive argument (e.g., modus ponens) | Clean implication chain with low fact-check difficulty |
| Circular reasoning ("the Bible is true because God says so, God exists because the Bible says so") | Detected cycle highlighted in purple with animated edge |
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
│         │                 │           └───────────────┘ │
│         │          ┌──────┴──────┐                      │
│         └─────────→│   api.ts    │←─────────────────────┘
│                    │ (DeepSeek   │
│                    │  REST call) │
│                    └─────────────┘
└─────────────────────────────────────────────────────────┘
```

### Data flow

```
User text → api.ts → POST /chat/completions (DeepSeek)
                    → Multi-strategy JSON extraction
                    → Zod validation (AnalysisResultSchema)
                    → App.tsx state
                    → GraphCanvas (dagre layout + ReactFlow render)
                    → Node click → DetailSidebar
```

### Key design decisions

- **Multi-strategy JSON extraction**: LLMs sometimes wrap JSON in markdown fences or add preamble text. The parser tries direct JSON parse → markdown fence → brace matching, in that order.
- **Zod as the contract**: The `AnalysisResultSchema` defines the exact shape the LLM must return. Malformed responses fail validation and surface as user-facing errors instead of crashing the app.
- **dagre for deterministic layout**: A layered top-to-bottom graph layout (`rankdir: "TB"`) with configurable spacing — no manual positioning.
- **Custom ReactFlow node/edge types**: `StatementNode` shows fact-check difficulty as a colored gradient bar and badge. `ArgumentEdge` applies a purple glow + dash animation to cycle edges.
- **Catppuccin Mocha dark theme**: Consistent color palette throughout (`#11111b` background, `#cdd6f4` text, etc.).
- **API key in localStorage**: Persisted across sessions via a `useLocalStorage` hook. Input is `type="password"` for basic privacy.

### Design philosophy: minimal surface, maximal depth

We follow a **Figma-like approach to UI complexity**: the default view should feel almost barren — just the graph and a subtle input panel. Everything else lives behind progressive disclosure:

- **Click a node** → a slide-out sidebar reveals fallacies, cycles, relations, and fact-check difficulty — then disappears when you click away
- **Errors** → inline notifications that can be dismissed, not persistent banners
- **Presets** → tucked into a dropdown that pre-fills the text area, never crowding the main view
- **Controls & minimap** → ReactFlow's built-in overlays, unobtrusive by default

The rule: **every feature must earn its pixels**. If information isn't immediately relevant to the current task, hide it behind an interaction. A new user should see a graph and one clear call to action — nothing else. Power is revealed on demand, never forced.

### Project structure

```
src/
├── App.tsx                      # Orchestrator — state, handlers, layout
├── api.ts                       # DeepSeek client, prompt, JSON extraction, Zod validation
├── types.ts                     # Zod schemas, TS types, color helpers, constants
├── presets.ts                   # Three demo arguments
├── index.css                    # Tailwind + custom scrollbar + ReactFlow overrides
├── main.tsx                     # Entry point
├── components/
│   ├── GraphCanvas.tsx           # ReactFlow + dagre layout engine
│   ├── InputPanel.tsx            # API key, preset selector, text area, submit
│   ├── StatementNode.tsx         # Custom ReactFlow node (difficulty bar, badges)
│   ├── ArgumentEdge.tsx          # Custom ReactFlow edge (cycle glow + animation)
│   └── DetailSidebar.tsx         # Right sidebar (statement detail, fallacies, cycles, relations)
└── hooks/
    └── useLocalStorage.ts        # Generic localStorage hook
```

## Limitations & Known Issues

> ⚠️ **This is an early-stage product.** Expect rough edges.

- **No retry logic** — transient API failures (rate limits, 5xx) are not retried
- **4096 token cap** — large arguments may be truncated by `max_tokens`. No chunking strategy yet.
- **dagre is deprecated** — should migrate to `@dagrejs/dagre` (the maintained fork)
- **No tests** — zero test coverage. Critical paths (JSON extraction, validation) need tests most.
- **No React error boundary** — a rendering error in one component can take down the whole app
- **API key in browser** — the key is sent directly from the client to DeepSeek. A proxy backend is planned.
- **Type assertion in StatementNode** — `data as unknown as StatementNodeData` is a workaround; ReactFlow typing should be tightened

## Roadmap

This project is under active development. Planned improvements:

- [ ] **Backend migration** — proxy API key, add user history, sharing, accounts
- [ ] **Improved processing pipeline** — chunking for large inputs, streaming responses
- [ ] **Live transcript input** — feed text from live audio transcripts for real-time analysis
- [ ] **Fact-check integration** — hook into [Brave's LLM Context API](https://brave.com/search/api/) for actual fact verification
- [ ] **UI/UX refinement** — polish the graph interaction, mobile experience, and accessibility
- [ ] **Migrate to `@dagrejs/dagre`** — replace deprecated dagre with the maintained fork
- [ ] **Add tests** — at minimum for the JSON extraction and Zod validation paths
- [ ] **Add React error boundary** — graceful failure instead of white screen
- [ ] **Retry with backoff** — handle rate limits and transient 5xx errors gracefully

## Contributing

See [AGENTS.md](./AGENTS.md) for AI coding assistant instructions and [CONTRIBUTING.md](./CONTRIBUTING.md) (coming soon) for human contributor guidelines.

### Quick guidelines
1. **Don't edit the system prompt in `src/api.ts` without careful thought** — it's the core contract with the LLM and small changes can break the entire analysis pipeline.
2. Keep the Zod schema (`src/types.ts`) in sync with any prompt changes.
3. Test JSON extraction with real LLM outputs — they're messier than you expect.
4. Prefer the Catppuccin Mocha palette for UI changes.

## License

MIT
