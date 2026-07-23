import { Loader2, CheckCircle2, AlertTriangle, RotateCcw, Eye, Terminal } from "lucide-react";
import type { PipelineProgress, ThemeMode } from "../types";

interface PipelineProgressProps {
  progress: PipelineProgress | null;
  errorMessage?: string;
  isPartial?: boolean;
  onRetry?: () => void;
  onViewPartial?: () => void;
  logCount?: number;
  showLogs?: boolean;
  onToggleLogs?: () => void;
  themeMode?: ThemeMode;
}

const STAGE_CONFIG: Record<string, { stepNumber: string; label: string }> = {
  preprocessing: { stepNumber: "Step 0", label: "Preprocessing text" },
  extracting: { stepNumber: "Step 1", label: "Extracting atomic claims" },
  analyzing_relations: { stepNumber: "Step 2", label: "Analyzing relations & cycles" },
  scoring: { stepNumber: "Step 3", label: "Scoring fact-check difficulty" },
  complete: { stepNumber: "Done", label: "Analysis complete" },
};

export function PipelineProgress({
  progress,
  errorMessage,
  isPartial,
  onRetry,
  onViewPartial,
  logCount = 0,
  showLogs = false,
  onToggleLogs,
  themeMode = "dark",
}: PipelineProgressProps) {
  if (!progress) return null;

  const isLight = themeMode === "light";
  const config = STAGE_CONFIG[progress.stage] ?? STAGE_CONFIG.extracting;
  const isComplete = progress.stage === "complete";
  const isError = !!errorMessage;
  const progressPercent = Math.round(
    (progress.currentStep / Math.max(progress.totalSteps, 1)) * 100
  );

  return (
    <div className="flex flex-col items-center gap-4 px-8 py-6 max-w-md mx-auto">
      {/* Stage indicator */}
      <div className="flex items-center gap-3">
        {!isComplete && !isError && (
          <Loader2 className="w-4 h-4 text-[#2563eb] animate-spin" />
        )}
        {isComplete && (
          <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
        )}
        {isError && (
          <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
        )}
        <span className="text-xs font-mono text-[#71717a] font-medium uppercase tracking-wider">
          [{config.stepNumber}]
        </span>
        <span
          className={`text-xs font-medium uppercase tracking-wider ${
            isComplete
              ? "text-[#22c55e]"
              : isError
                ? "text-[#ef4444]"
                : isLight
                  ? "text-[#18181b]"
                  : "text-[#f4f4f5]"
          }`}
        >
          {isError ? "Pipeline Error" : config.label}
        </span>
      </div>

      {/* Statement count */}
      {progress.statementsFound > 0 && (
        <div className={`text-xs font-mono ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
          {progress.statementsFound} statement{progress.statementsFound !== 1 ? "s" : ""} extracted
        </div>
      )}

      {/* Progress bar */}
      {!isComplete && !isError && (
        <div className={`w-56 h-1 rounded overflow-hidden ${isLight ? "bg-[#e4e4e7]" : "bg-[#3f3f46]"}`}>
          <div
            className="h-full rounded bg-[#2563eb] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Toggle detailed logs button */}
      {onToggleLogs && (
        <button
          onClick={onToggleLogs}
          className={`text-xs flex items-center gap-1.5 cursor-pointer transition-colors pt-1 ${
            isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>{showLogs ? "Hide Detailed Logs" : "Show Detailed Logs"}</span>
          {logCount > 0 && (
            <span className={`px-1.5 py-0.2 text-[10px] rounded font-mono ${
              isLight ? "bg-[#e4e4e7] text-[#71717a]" : "bg-[#27272a] text-[#a1a1aa]"
            }`}>
              {logCount}
            </span>
          )}
        </button>
      )}

      {/* Error with recovery */}
      {isError && (
        <div className="flex flex-col items-center gap-3 mt-1">
          <p className="text-xs text-[#ef4444] text-center max-w-xs leading-relaxed font-normal">
            {errorMessage}
          </p>
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 text-xs font-medium rounded bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Stage</span>
              </button>
            )}
            {isPartial && onViewPartial && (
              <button
                onClick={onViewPartial}
                className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isLight
                    ? "border-[#e4e4e7] text-[#71717a] hover:text-[#18181b] hover:bg-[#f4f4f5]"
                    : "border-[#3f3f46] text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a]"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Partial Graph</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <p className={`text-xs ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>{progress.message}</p>
      )}
    </div>
  );
}



