/**
 * Shared types — plain TypeScript interfaces for client and DO compatibility.
 * Runtime validation is handled by effect/Schema in src/shared/schemas.ts.
 */

// --- Core types ---

export interface Statement {
  id: string;
  text: string;
  factCheckDifficulty: number;
  factCheckExplanation?: string;
  speakerId?: string;
}

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface Relation {
  from: string;
  to: string;
  type: "implication" | "conjunction" | "disjunction" | "supports" | "contradiction" | "fallacy" | "restates";
  label?: string;
  details?: string;
}

export interface AnalysisResult {
  statements: Statement[];
  relations: Relation[];
  fallacies?: Array<{ statementId: string; fallacyType: string; description: string }>;
  cycles?: Array<{ nodeIds: string[]; description: string }>;
  speakers?: Speaker[];
}

export interface PartialAnalysisResult {
  statements?: Statement[];
  relations?: Relation[];
  fallacies?: Array<{ statementId: string; fallacyType: string; description: string }>;
  cycles?: Array<{ nodeIds: string[]; description: string }>;
  speakers?: Speaker[];
}

// --- Preset type ---

export interface Preset {
  id: string;
  label: string;
  description: string;
  text: string;
}

// --- Pipeline types ---

export type PipelineStage = "preprocessing" | "extracting" | "analyzing_relations" | "scoring" | "complete";

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  statementsFound: number;
  totalSteps: number;
  currentStep: number;
  elapsedMs?: number;
  totalTokens?: number;
}

// --- Theme ---

export type ThemeMode = "dark" | "light";

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

export type AppStatus = "idle" | "running" | "partial" | "success" | "error";

// --- Error types ---

export class PipelineStepError extends Error {
  public readonly step: PipelineStage;
  public readonly partialResult: PartialAnalysisResult;

  constructor(message: string, step: PipelineStage, partialResult: PartialAnalysisResult) {
    super(message);
    this.name = "PipelineStepError";
    this.step = step;
    this.partialResult = partialResult;
  }
}

// --- Colors ---

export function difficultyColor(percent: number): string {
  if (percent <= 30) return "#22c55e";
  if (percent <= 70) return "#eab308";
  return "#ef4444";
}

export function difficultyBgColor(_percent: number): string {
  return "#1c1c20";
}

export const SPEAKER_COLORS = [
  "#60a5fa", "#818cf8", "#34d399", "#fbbf24",
  "#a78bfa", "#2dd4bf", "#f87171", "#fb923c",
];

export const FALLACY_COLOR = "#ef4444";
export const CYCLE_COLOR = "#a855f7";
