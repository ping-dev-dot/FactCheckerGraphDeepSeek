import type { PipelineProgress } from "../types";

interface PipelineProgressProps {
  progress: PipelineProgress | null;
  errorMessage?: string;
  isPartial?: boolean;
  onRetry?: () => void;
  onViewPartial?: () => void;
}

const STAGE_CONFIG: Record<string, { icon: string; label: string }> = {
  preprocessing: { icon: "🔍", label: "Preprocessing" },
  extracting: { icon: "📝", label: "Extracting statements" },
  analyzing_relations: { icon: "🔗", label: "Analyzing relations" },
  scoring: { icon: "📊", label: "Scoring fact-check difficulty" },
  complete: { icon: "✅", label: "Complete" },
};

export function PipelineProgress({
  progress,
  errorMessage,
  isPartial,
  onRetry,
  onViewPartial,
}: PipelineProgressProps) {
  if (!progress) return null;

  const config = STAGE_CONFIG[progress.stage] ?? STAGE_CONFIG.extracting;
  const isComplete = progress.stage === "complete";
  const isError = !!errorMessage;
  const progressPercent = Math.round(
    (progress.currentStep / Math.max(progress.totalSteps, 1)) * 100
  );

  return (
    <div className="flex flex-col items-center gap-4 px-8 py-6">
      {/* Stage indicator */}
      <div className="flex items-center gap-2">
        {progress.stage !== "complete" && !isError && (
          <div className="w-8 h-8 border-3 border-[#89b4fa] border-t-transparent rounded-full animate-spin" />
        )}
        <span className="text-2xl">{config.icon}</span>
        <span
          className={`text-sm font-semibold ${
            isComplete
              ? "text-[#a6e3a1]"
              : isError
                ? "text-[#f38ba8]"
                : "text-[#cdd6f4]"
          }`}
        >
          {isError ? "Error" : config.label}
        </span>
      </div>

      {/* Statement count */}
      {progress.statementsFound > 0 && (
        <div className="text-xs text-[#89b4fa] font-mono">
          {progress.statementsFound} statement{progress.statementsFound !== 1 ? "s" : ""} found
        </div>
      )}

      {/* Progress bar */}
      {!isComplete && !isError && (
        <div className="w-48 h-1.5 rounded-full bg-[#313244] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#89b4fa] to-[#a6e3a1] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Error with recovery */}
      {isError && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <p className="text-xs text-[#f38ba8] text-center max-w-xs">
            {errorMessage}
          </p>
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] transition-colors"
              >
                Retry
              </button>
            )}
            {isPartial && onViewPartial && (
              <button
                onClick={onViewPartial}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#89b4fa] text-[#89b4fa] hover:bg-[#89b4fa]/10 transition-colors"
              >
                View Statements
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <p className="text-xs text-[#a6adc8]">{progress.message}</p>
      )}
    </div>
  );
}
