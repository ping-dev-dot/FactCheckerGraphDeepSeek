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
  elapsedMs?: number;
  totalTokens?: number;
}

// --- Theme Mode ---

export type ThemeMode = "dark" | "light";

// --- API Provider & Settings ---


export type ApiProvider = "deepseek" | "openrouter";

export interface ApiSettings {
  provider: ApiProvider;
  apiKey: string;
  model: string;
}

// --- Logging ---

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: string;
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
  if (percent <= 30) return "#22c55e"; // Easy — clear green
  if (percent <= 70) return "#eab308"; // Moderate — clear amber
  return "#ef4444"; // Hard — clear red
}

export function difficultyBgColor(_percent: number): string {
  return "#1c1c20"; // Quiet, unified neutral dark surface for all nodes
}


// --- Speaker color palette (Quiet, dignified muted tones) ---
export const SPEAKER_COLORS = [
  "#60a5fa", // muted blue
  "#818cf8", // muted indigo
  "#34d399", // muted emerald
  "#fbbf24", // muted amber
  "#a78bfa", // muted purple
  "#2dd4bf", // muted teal
  "#f87171", // muted rose
  "#fb923c", // muted orange
];

// --- Fallacy & Cycle highlight colors ---
export const FALLACY_COLOR = "#ef4444";
export const CYCLE_COLOR = "#a855f7";

