import { z } from "zod";

// --- Zod schemas for API response validation ---

export const StatementSchema = z.object({
  id: z.string(),
  text: z.string(),
  factCheckDifficulty: z.number().min(0).max(100),
  factCheckExplanation: z.string().optional(),
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
});

// --- Derived TypeScript types ---

export type Statement = z.infer<typeof StatementSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// --- Preset type ---

export interface Preset {
  id: string;
  label: string;
  description: string;
  text: string;
}

// --- App state ---

export type AppStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

export interface AppState {
  apiKey: string;
  inputText: string;
  selectedPreset: string;
  status: AppStatus;
  errorMessage: string;
  result: AnalysisResult | null;
  selectedNodeId: string | null;
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

// --- Fallacy highlight color ---
export const FALLACY_COLOR = "#f38ba8";
export const CYCLE_COLOR = "#cba6f7";
