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
  typ?: "faktisch" | "meinung" | "nicht_pruefbar";
  finalVerdict?: string;
  finalEvaluation?: string;
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

export interface QueryItem {
  id: string;
  statementId: string;
  text: string;
  createdAt?: string;
}

export interface QueryResultItem {
  id: string;
  queryId: string;
  statementId: string;
  url: string;
  title?: string;
  snippets?: string[];
  createdAt?: string;
}

export interface FactCheckSource {
  id: string;
  statementId: string;
  queryResultId?: string;
  urteil: "stuetzt" | "widerlegt" | "irrelevant";
  konfidenz?: number;
  begruendung: string;
  url?: string;
  title?: string;
}

export interface AnalysisResult {
  statements: Statement[];
  relations: Relation[];
  fallacies?: Array<{ statementId: string; fallacyType: string; description: string }>;
  cycles?: Array<{ nodeIds: string[]; description: string }>;
  speakers?: Speaker[];
  queries?: QueryItem[];
  queryResults?: QueryResultItem[];
  factCheckSources?: FactCheckSource[];
}

export interface PartialAnalysisResult {
  statements?: Statement[];
  relations?: Relation[];
  fallacies?: Array<{ statementId: string; fallacyType: string; description: string }>;
  cycles?: Array<{ nodeIds: string[]; description: string }>;
  speakers?: Speaker[];
  queries?: QueryItem[];
  queryResults?: QueryResultItem[];
  factCheckSources?: FactCheckSource[];
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

// --- Model Selection ---

export interface ModelOption {
  id: string;       // OpenRouter model ID  e.g. "deepseek/deepseek-chat"
  label: string;    // Display name
  provider: string; // Short provider tag  e.g. "DeepSeek"
}

export const OPENROUTER_MODELS: ModelOption[] = [
  { id: "deepseek/deepseek-v4-flash-0731",  label: "DeepSeek V4 Flash (0731)",      provider: "DeepSeek" },
  { id: "deepseek/deepseek-chat",           label: "DeepSeek V3 (Chat)",            provider: "DeepSeek" },
  { id: "deepseek/deepseek-r1",             label: "DeepSeek R1 (Reasoning)",       provider: "DeepSeek" },
  { id: "deepseek/deepseek-r1-0528",        label: "DeepSeek R1 0528",              provider: "DeepSeek" },
  { id: "google/gemini-2.0-flash-001",      label: "Gemini 2.0 Flash",              provider: "Google" },
  { id: "google/gemini-2.5-flash",          label: "Gemini 2.5 Flash",              provider: "Google" },
  { id: "openai/gpt-4o-mini",               label: "GPT-4o Mini",                   provider: "OpenAI" },
  { id: "openai/gpt-4.1-mini",              label: "GPT-4.1 Mini",                  provider: "OpenAI" },
  { id: "anthropic/claude-3.5-haiku",       label: "Claude 3.5 Haiku",              provider: "Anthropic" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B",               provider: "Meta" },
  { id: "qwen/qwen3-235b-a22b",             label: "Qwen 3 235B MoE",               provider: "Alibaba" },
];

export const DEFAULT_MODEL = OPENROUTER_MODELS[0].id;

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

// --- Colors ---

export function difficultyColor(percent: number): string {
  if (percent <= 30) return "#22c55e";
  if (percent <= 70) return "#eab308";
  return "#ef4444";
}

export const SPEAKER_COLORS = [
  "#60a5fa", "#818cf8", "#34d399", "#fbbf24",
  "#a78bfa", "#2dd4bf", "#f87171", "#fb923c",
];

export const FALLACY_COLOR = "#ef4444";
export const CYCLE_COLOR = "#a855f7";
