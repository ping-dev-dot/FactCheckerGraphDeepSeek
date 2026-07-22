# AGENTS.md — AI Coding Assistant Instructions

> **Project**: FactCheckerGraphDeepSeek — Argument graph analyzer powered by DeepSeek
> **Stack**: React 19, TypeScript 6, Vite 8, Tailwind 4, ReactFlow, dagre, Zod
> **Deploy**: GitHub Pages via Actions (branch: `master`)

---

## ⚠️ Critical Rule

**DO NOT edit the system prompt in `src/api.ts` without explicit user approval.** The prompt is a carefully tuned contract with the LLM. Even small phrasing changes can break the JSON extraction pipeline, cause validation failures, or produce nonsensical graph output. If you think the prompt needs a change, explain why and ask first.

---

## Project Overview

This is a **single-page web application** that:

1. Takes argumentative text from the user
2. Sends it to DeepSeek's chat API with a structured system prompt
3. Extracts JSON from the LLM response (multi-strategy: direct parse → markdown fence → brace match)
4. Validates the result against a Zod schema
5. Renders an interactive argument graph using ReactFlow + dagre auto-layout
6. Shows statement details, fallacies, and cycles in a sidebar on node click

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
| `src/api.ts` | DeepSeek client, system prompt, JSON extraction, Zod validation, `DeepSeekError` class | ⚠️ **Prompt edits require approval** |
| `src/types.ts` | Zod schemas (`AnalysisResultSchema`), TS types, color helpers, constants | ✅ Must stay in sync with api.ts |
| `src/App.tsx` | Top-level orchestrator — state, handlers, three-panel layout | ✅ |
| `src/components/InputPanel.tsx` | Left panel — API key input, preset selector, text area, submit button | ✅ |
| `src/components/GraphCanvas.tsx` | Center — ReactFlow wrapper + dagre layout engine | ✅ |
| `src/components/StatementNode.tsx` | Custom ReactFlow node — text, difficulty bar, fallacy/cycle badges | ✅ |
| `src/components/ArgumentEdge.tsx` | Custom ReactFlow edge — cycle glow + dash animation | ✅ |
| `src/components/DetailSidebar.tsx` | Right panel — statement detail, fallacies, cycles, relations | ✅ |
| `src/presets.ts` | Three demo argument presets | ✅ |
| `src/hooks/useLocalStorage.ts` | Generic localStorage persistence hook (API key) | ✅ |
| `src/index.css` | Tailwind import + custom scrollbar + ReactFlow overrides + cycle animation | ✅ |
| `.github/workflows/deploy.yml` | GitHub Actions: build + deploy to GitHub Pages on push to `master` | ✅ |

---

## Architecture Rules

### 1. The Zod Schema Is the Contract

`AnalysisResultSchema` in `src/types.ts` defines the exact shape the LLM must return. Malformed responses are caught before rendering.

**When editing**: if you change the system prompt to produce different output, you **must** update the schema to match. Otherwise every API response will fail validation.

### 2. JSON Extraction Pipeline

The `extractJson()` function in `src/api.ts` tries three strategies in order:
1. **Direct `JSON.parse()`** — works when the LLM returns clean JSON
2. **Markdown fence regex** — handles ` ```json ... ``` ` wrapping
3. **Brace matching regex** — last resort, finds the first `{...}` pair

If you encounter extraction failures, **add a strategy** rather than replacing the pipeline. Real LLM outputs vary wildly.

### 3. Data Flow

```
User text
  → api.ts (POST to DeepSeek, extract JSON, Zod validate)
  → App.tsx (state: result: AnalysisResult | null)
  → GraphCanvas (dagre layout → ReactFlow nodes + edges)
  → Node click → App (selectedNodeId)
  → DetailSidebar (filtered relations, fallacies, cycles)
```

**Do not skip Zod validation.** The schema is the safety net between an unpredictable LLM and the rendering code.

### 4. State Management

All state lives in `App.tsx` using `useState` — no external state library, no context, no Redux. Keep it that way unless a backend migration demands otherwise.

The API key is persisted in `localStorage` via `useLocalStorage`. It's sent as a `Bearer` token in the `Authorization` header.

### 5. Graph Layout

- **dagre** computes a layered top-to-bottom layout (`rankdir: "TB"`, `nodesep: 80`, `ranksep: 120`)
- Nodes are 220×120px; dagre positions are centered by offsetting `-110, -60`
- **dagre is deprecated** — migrate to `@dagrejs/dagre` when touching the layout code
- The commented-out `setTimeout` on `fitView` in `GraphCanvas.tsx:89` was a hack for ReactFlow timing. If `fitView` doesn't apply after layout changes, you may need it back.

### 6. Custom Nodes & Edges

- `StatementNode` — registers as `"statementNode"` in ReactFlow's `nodeTypes`. Maps `factCheckDifficulty` to a gradient bar (green ≤30%, yellow ≤70%, red >70%). Shows fallacy/cycle badges.
- `ArgumentEdge` — registers as `"argumentEdge"`. Applies purple color (`#cba6f7`) + dash animation to edges that are part of a cycle. Normal edges are gray with an arrow marker.

### 7. Theme

Catppuccin Mocha palette throughout:
- Background: `#11111b` (base), `#1e1e2e` (surface), `#181825` (mantle)
- Text: `#cdd6f4` (text), `#a6adc8` (subtext), `#585b70` (overlay)
- Accent: `#89b4fa` (blue), `#a6e3a1` (green), `#f9e2af` (yellow), `#f38ba8` (red), `#cba6f7` (mauve/purple)

Stick to this palette for UI changes. Color helpers (`difficultyColor`, `difficultyBgColor`) are in `src/types.ts`.

---

## Known Sharp Edges

1. **`data as unknown as StatementNodeData`** in `StatementNode.tsx:13` — a type workaround. If you touch ReactFlow types, tighten this properly.
2. **`max_tokens: 4096`** in `api.ts` — large arguments can get truncated. No chunking exists yet.
3. **No retry logic** — transient API failures (429, 5xx) aren't retried. Add exponential backoff if you touch the API layer.
4. **No React error boundary** — a crash in any component takes down the whole app. Wrap the graph and sidebar in error boundaries.
5. **Zero tests** — `extractJson()` and the Zod validation path are the highest-priority test targets.
6. **API key exposed** — the key is sent from the browser. A proxy backend is on the roadmap.

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

---

## Quick Commands

```bash
npm run dev       # Start dev server (http://localhost:5173/FactCheckerGraphDeepSeek/)
npm run build     # TypeScript check + Vite production build
npm run lint      # Oxlint
npm run preview   # Preview production build locally
```

---

## Communication Style

- Be concise — don't explain what the code already says
- Reference files with paths (e.g., `src/api.ts:45`)
- When proposing changes to the prompt or schema, show the diff and explain the reasoning
- If something looks like a bug, flag it but don't fix it without confirming
