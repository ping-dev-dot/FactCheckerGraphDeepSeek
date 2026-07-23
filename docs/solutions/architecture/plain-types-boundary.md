---
title: "Plain TS types boundary between client and server — no effect/Schema in shared layer"
category: architecture
severity: high
tags: [types.ts, effect/Schema, client-bundle, white-screen, export-type, monorepo, type-boundary]
applies_when:
  - "Monorepo with shared types between client (no heavy deps) and server (EffectJS/Zod)"
  - "White screen or bundle bloat after adding type re-exports"
  - "Server-side validation library (effect/Schema, Zod) leaks into client bundle"
---

## Problem

`export type { ... } from "./schemas"` in a shared `types.ts` file, where `schemas.ts` imports `effect` (or any heavy server library), causes the server library to enter Vite's module graph. Even though only types are re-exported, the bundler resolves the entire import chain and may include runtime code, causing white screens or bundle bloat.

## Root Cause

TypeScript's `export type` is erased at compile time, but bundlers like Vite/Rolldown resolve the full module graph including all transitive `import` statements. If `schemas.ts` has `import { Schema } from "effect"`, that import is processed even when only types are re-exported.

## Solution

Keep shared types as **plain TypeScript interfaces** with zero dependencies:

```typescript
// ✅ src/shared/types.ts — no imports from effect, zod, or any runtime library
export interface Statement {
  id: string;
  text: string;
  factCheckDifficulty: number;
  // ...
}
```

Server-only runtime validation lives in a separate file imported only by server code:

```typescript
// ✅ src/shared/schemas.ts — ONLY imported by DO/Worker code
import { Schema } from "effect";
export const StatementSchema = Schema.Struct({ ... });
```

The DO imports both files; the client imports only `types.ts`.

## Anti-pattern

```typescript
// ❌ src/shared/types.ts — DO NOT do this
import { Schema } from "effect"; // pulls effect into client bundle!
export type Statement = Schema.Schema.Type<typeof StatementSchema>;
// Or even:
export type { Statement } from "./schemas"; // still resolves schemas.ts → effect
```

## Detection

- White screen with no console errors after consolidating type files
- Bundle size unexpectedly grows by 50KB+ (effect library)
- `grep "effect" dist/assets/*.js` finds effect runtime code in client bundle
