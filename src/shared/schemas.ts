/**
 * Shared schemas using effect/Schema.
 * Replaces Zod with native Effect integration for typed errors and validation.
 */

import { Schema } from "effect";

// ── FactCheck & Verification ──

export const FactCheckVerdictSchema = Schema.Literal(
  "supported",
  "refuted",
  "inconclusive",
  "partially_true"
);

export const EvidenceSourceSchema = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.String,
  publishedDate: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  snippet: Schema.String,
  score: Schema.optional(Schema.Number),
});

export const StatementFactCheckSchema = Schema.Struct({
  statementId: Schema.String,
  verdict: FactCheckVerdictSchema,
  confidence: Schema.Number.pipe(Schema.between(0, 100)),
  summary: Schema.String,
  sources: Schema.Array(EvidenceSourceSchema),
  verifiedAt: Schema.String,
});

export const FactCheckSynthesisSchema = Schema.Struct({
  verdict: FactCheckVerdictSchema,
  confidence: Schema.Number.pipe(Schema.between(0, 100)),
  summary: Schema.String,
  relevantSourceUrls: Schema.optional(Schema.Array(Schema.String)),
});

// ── Statement ──

export const StatementSchema = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  factCheckDifficulty: Schema.Number.pipe(Schema.between(0, 100)),
  factCheckExplanation: Schema.optional(Schema.String),
  speakerId: Schema.optional(Schema.String),
  factCheck: Schema.optional(StatementFactCheckSchema),
});

// ── Speaker ──

export const SpeakerSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.String,
});

// ── Relation ──

export const RelationTypeSchema = Schema.Literal(
  "implication",
  "conjunction",
  "disjunction",
  "supports",
  "contradiction",
  "fallacy",
  "restates"
);

export const RelationSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  type: RelationTypeSchema,
  label: Schema.optional(Schema.String),
  details: Schema.optional(Schema.String),
});

// ── Fallacy ──

export const FallacySchema = Schema.Struct({
  statementId: Schema.String,
  fallacyType: Schema.String,
  description: Schema.String,
});

// ── Cycle ──

export const CycleSchema = Schema.Struct({
  nodeIds: Schema.Array(Schema.String),
  description: Schema.String,
});

// ── AnalysisResult ──

export const AnalysisResultSchema = Schema.Struct({
  statements: Schema.Array(StatementSchema),
  relations: Schema.Array(RelationSchema),
  fallacies: Schema.optional(Schema.Array(FallacySchema)),
  cycles: Schema.optional(Schema.Array(CycleSchema)),
  speakers: Schema.optional(Schema.Array(SpeakerSchema)),
});

// ── PartialAnalysisResult ──

export const PartialAnalysisResultSchema = Schema.Struct({
  statements: Schema.optional(Schema.Array(StatementSchema)),
  relations: Schema.optional(Schema.Array(RelationSchema)),
  fallacies: Schema.optional(Schema.Array(FallacySchema)),
  cycles: Schema.optional(Schema.Array(CycleSchema)),
  speakers: Schema.optional(Schema.Array(SpeakerSchema)),
});

// ── Derived types (equivalent to Zod's z.infer) ──

export type Statement = Schema.Schema.Type<typeof StatementSchema>;
export type Speaker = Schema.Schema.Type<typeof SpeakerSchema>;
export type Relation = Schema.Schema.Type<typeof RelationSchema>;
export type AnalysisResult = Schema.Schema.Type<typeof AnalysisResultSchema>;
export type PartialAnalysisResult = Schema.Schema.Type<typeof PartialAnalysisResultSchema>;
export type StatementFactCheck = Schema.Schema.Type<typeof StatementFactCheckSchema>;
export type EvidenceSource = Schema.Schema.Type<typeof EvidenceSourceSchema>;

