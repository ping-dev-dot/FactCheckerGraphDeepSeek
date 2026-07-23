import type { PipelineProgress } from "../types";

interface PipelineProgressProps {
  progress: PipelineProgress | null;
  errorMessage?: string;
  isPartial?: boolean;
  onRetry?: () => void;
  onViewPartial?: () => void;
  logCount?: number;
  showLogs?: boolean;
  onToggleLogs?: () => void;
}

const STAGE_CONFIG: Record<string, { icon: string; label: string }> = {
  preprocessing: { icon: "manage_search", label: "Preprocessing" },
  extracting: { icon: "edit_note", label: "Extracting statements" },
  analyzing_relations: { icon: "account_tree", label: "Analyzing relations" },
  scoring: { icon: "fact_check", label: "Scoring fact-check difficulty" },
  complete: { icon: "check_circle", label: "Complete" },
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
}: PipelineProgressProps) {
  if (!progress) return null;

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
        {progress.stage !== "complete" && !isError ? (
          <md-circular-progress indeterminate style={{ width: "24px", height: "24px" }}></md-circular-progress>
        ) : (
          <md-icon style={{ color: isError ? "var(--md-sys-color-error)" : "var(--md-sys-color-primary)" }}>
            {config.icon}
          </md-icon>
        )}
        <span
          className={`text-base font-semibold ${
            isComplete
              ? "text-[var(--md-sys-color-primary)]"
              : isError
                ? "text-[var(--md-sys-color-error)]"
                : "text-[var(--md-sys-color-on-surface)]"
          }`}
        >
          {isError ? "Error" : config.label}
        </span>
      </div>

      {/* Statement count */}
      {progress.statementsFound > 0 && (
        <div className="text-xs font-mono text-[var(--md-sys-color-primary)] flex items-center gap-1">
          <md-icon style={{ fontSize: '16px' }}>format_list_bulleted</md-icon>
          {progress.statementsFound} statement{progress.statementsFound !== 1 ? "s" : ""} found
        </div>
      )}

      {/* Progress bar */}
      {!isComplete && !isError && (
        <div className="w-64">
          <md-linear-progress
            value={progressPercent / 100}
            buffer={1}
            style={{ width: "100%" }}
          ></md-linear-progress>
        </div>
      )}

      {/* Toggle detailed logs button */}
      {onToggleLogs && (
        <button
          onClick={onToggleLogs}
          className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] underline flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <md-icon style={{ fontSize: '16px' }}>list_alt</md-icon>
          <span>{showLogs ? "Hide Detailed Logs" : "Show Detailed Logs"}</span>
          {logCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] font-mono font-semibold">
              {logCount}
            </span>
          )}
        </button>
      )}

      {/* Error recovery */}
      {isError && (
        <div className="flex flex-col items-center gap-3 mt-2">
          <p className="text-xs text-[var(--md-sys-color-error)] text-center leading-relaxed bg-[var(--md-sys-color-error-container)] p-3 rounded-lg">
            {errorMessage}
          </p>
          <div className="flex items-center gap-2">
            {onRetry && (
              <md-filled-button onClick={onRetry}>
                <md-icon slot="icon">refresh</md-icon>
                Retry
              </md-filled-button>
            )}
            {isPartial && onViewPartial && (
              <md-outlined-button onClick={onViewPartial}>
                <md-icon slot="icon">visibility</md-icon>
                View Statements
              </md-outlined-button>
            )}
          </div>
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{progress.message}</p>
      )}
    </div>
  );
}
