import { z } from "zod";

// --- Zod schemas for API response validation ---

export const StatementSchema = z.object({
  id: z.string(),
  text: z.string(),
  factCheckDifficulty: z.number().min(0).max(100),
  factCheckExplanation: z.string().optional(),
  speakerId: z.string().optional(),
});

export const SpeakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum([
    "implication",
    "conjunction",
    "disjunction",
    "supports",
    "contradiction",
    "fallacy",
    "restates",
  ]),
  label: z.string().optional(),
  details: z.string().optional(),
});

export const AnalysisResultSchema = z.object({
  statements: z.array(StatementSchema),
  relations: z.array(RelationSchema),
  fallacies: z
    .array(
      z.object({
        statementId: z.string(),
        fallacyType: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  cycles: z
    .array(z.object({ nodeIds: z.array(z.string()), description: z.string() }))
    .optional(),
  speakers: z.array(SpeakerSchema).optional(),
});

export const PartialAnalysisResultSchema = z.object({
  statements: z.array(StatementSchema).optional(),
  relations: z.array(RelationSchema).optional(),
  fallacies: z
    .array(
      z.object({
        statementId: z.string(),
        fallacyType: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  cycles: z
    .array(z.object({ nodeIds: z.array(z.string()), description: z.string() }))
    .optional(),
  speakers: z.array(SpeakerSchema).optional(),
});

// --- Derived TypeScript types ---

export type Statement = z.infer<typeof StatementSchema>;
export type Speaker = z.infer<typeof SpeakerSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type PartialAnalysisResult = z.infer<typeof PartialAnalysisResultSchema>;

// --- Preset type ---

export interface Preset {
  id: string;
  label: string;
  description: string;
  text: string;
}

// --- Pipeline types ---

export type PipelineStage =
  | "preprocessing"
  | "extracting"
  | "analyzing_relations"
  | "scoring"
  | "complete";

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  statementsFound: number;
  totalSteps: number;
  currentStep: number;
}

// --- App state ---

export type AppStatus =
  | "idle"
  | "running"
  | "partial"
  | "success"
  | "error";

export interface AppState {
  apiKey: string;
  inputText: string;
  selectedPreset: string;
  status: AppStatus;
  errorMessage: string;
  result: AnalysisResult | null;
  partialResult: PartialAnalysisResult | null;
  selectedNodeId: string | null;
  pipelineProgress: PipelineProgress | null;
}

// --- Error types ---

export class PipelineStepError extends Error {
  public readonly step: PipelineStage;
  public readonly partialResult: PartialAnalysisResult;

  constructor(
    message: string,
    step: PipelineStage,
    partialResult: PartialAnalysisResult
  ) {
    super(message);
    this.name = "PipelineStepError";
    this.step = step;
    this.partialResult = partialResult;
  }
}

// --- Node color mapping based on fact-check difficulty ---
export function difficultyColor(percent: number): string {
  if (percent <= 30) return "#a6e3a1"; // green — easy to check
  if (percent <= 70) return "#f9e2af"; // yellow — moderate
  return "#f38ba8"; // red — hard to check
}

export function difficultyBgColor(percent: number): string {
  if (percent <= 30) return "#1e3a1e";
  if (percent <= 70) return "#3a3510";
  return "#3a1020";
}

// --- Speaker color palette (Catppuccin) ---
export const SPEAKER_COLORS = [
  "#89b4fa", // blue
  "#a6e3a1", // green
  "#f9e2af", // yellow
  "#f38ba8", // red
  "#cba6f7", // mauve
  "#94e2d5", // teal
  "#fab387", // peach
  "#b4befe", // lavender
];

// --- Fallacy highlight color ---
export const FALLACY_COLOR = "#f38ba8";
export const CYCLE_COLOR = "#cba6f7";
