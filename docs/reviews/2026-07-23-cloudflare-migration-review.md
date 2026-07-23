# 04-Review — Cloudflare Migration

**Date**: 2026-07-23
**Reviewers**: correctness, testing, maintainability, integration, thoroughness

## Findings Summary

| # | Axis | Severity | Finding | Status |
|---|------|----------|---------|--------|
| C1 | Correctness | Med | `streamText` had no error handling — raw exception vs typed AiClientError | ✅ Fixed |
| C2 | Correctness | Low | DO re-processes on reconnect — no caching. Known limitation from plan (stretch goal) | ⚠️ Noted |
| M1 | Maintainability | Med | Dual type system: `types.ts` (plain TS) vs `schemas.ts` (effect/Schema). Client used stale compatibility wrappers. | ✅ Fixed — types.ts now re-exports from schemas.ts |
| M2 | Maintainability | Low | DO duplicated preprocess logic instead of using shared `preprocess()` | ✅ Fixed |
| M3 | Maintainability | Low | Dynamic `await import()` in DO hot path — 4 calls per request | ✅ Fixed — static imports |
| M4 | Maintainability | Low | Hardcoded account ID in ai-client.ts | ✅ Fixed — named constant |
| T1 | Testing | Med | No test for DO `handleSSE` (100+ lines, most complex code) | ⚠️ Acknowledged |
| T2 | Testing | Med | No test for Worker HTTP routing | ⚠️ Acknowledged |
| I1 | Integration | Low | wrangler.jsonc missing CF_AIG_TOKEN documentation | ✅ Fixed — documented in plan |
| TH1 | Thoroughness | Low | Dead file: `src/client/api.ts` | ✅ Removed |
| TH2 | Thoroughness | Low | Dead file: `src/client/components/SettingsPanel.tsx` | ✅ Removed |
| TH3 | Thoroughness | Low | `types.ts` had dead exports (ApiSettings, ApiProvider, AppState) | ✅ Cleaned |

## Autofixes Applied (6 changes)

1. **Removed** `src/client/api.ts` — dead code, not imported
2. **Removed** `src/client/components/SettingsPanel.tsx` — dead code, not imported
3. **Consolidated** `types.ts` — re-exports from `schemas.ts`, removed Zod-era wrappers and dead exports
4. **Fixed** DO dynamic imports → static imports (`preprocess`, `extractStatements`, `analyzeRelations`, `scoreStatements`, `postprocessConclusions`)
5. **Fixed** DO duplicated preprocess → uses shared `preprocess()` from pipeline-logic.ts
6. **Fixed** `ai-client.ts` — extracted `CF_ACCOUNT_ID` constant, added error handling to `streamText`

## Remaining Known Issues

| Issue | Why not fixed | Mitigation |
|-------|--------------|------------|
| DO re-processes on reconnect | Stretch goal per plan | Acceptable for v1 |
| No test for DO `handleSSE` | Requires Wrangler test infra | Manual QA verification |
| No test for Worker routing | Same | Manual curl / browser tests |

## Verification

```
✅ Vite build: 491KB (client)
✅ Wrangler dry-run: DO + Assets bindings
✅ Unit tests: 33/33 (pipeline)
✅ E2E tests: 19/19 (real API)
✅ Shared tests: 63/63 (schemas + utilities)
⭐ Total: 115 tests passing
```
