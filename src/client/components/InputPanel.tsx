import { useState, useEffect } from "react";
import { Sun, Moon, Play, Loader2, AlertTriangle, Clock, Hash, X } from "lucide-react";
import type { PipelineProgress, ThemeMode } from "../../shared/types";
import { PRESETS } from "../presets";

interface InputPanelProps {
  inputText: string;
  onInputTextChange: (text: string) => void;
  selectedPreset: string;
  onPresetSelect: (presetId: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  pipelineProgress?: PipelineProgress | null;
  variant?: "desktop" | "mobile-input";
  onClose?: () => void;
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
}

export function InputPanel({
  inputText,
  onInputTextChange,
  selectedPreset,
  onPresetSelect,
  onSubmit,
  isLoading,
  pipelineProgress,
  variant = "desktop",
  onClose,
  themeMode = "dark",
  onThemeModeChange,
}: InputPanelProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  const isComplete = pipelineProgress?.stage === "complete";
  const isMobileInput = variant === "mobile-input";
  const isLight = themeMode === "light";

  useEffect(() => {
    if (!isLoading) { setElapsedSec(0); return; }
    if (!pipelineProgress || isComplete) return;
    const start = Date.now() - (pipelineProgress.elapsedMs ?? 0);
    setElapsedSec(Math.max(0, (pipelineProgress.elapsedMs ?? 0) / 1000));
    const interval = setInterval(() => {
      setElapsedSec(Math.max(0, (Date.now() - start) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [isLoading, pipelineProgress, isComplete]);

  const displayTime = isComplete
    ? ((pipelineProgress?.elapsedMs ?? (elapsedSec * 1000)) / 1000).toFixed(1)
    : elapsedSec.toFixed(1);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    onPresetSelect(id);
    if (id) {
      const preset = PRESETS.find((p) => p.id === id);
      if (preset) onInputTextChange(preset.text);
    } else {
      onInputTextChange("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit();
  };

  const canSubmit = inputText.trim().length > 0 && !isLoading;

  return (
    <div
      className={`h-full flex flex-col overflow-hidden ${
        isLight ? "bg-[#ffffff] text-[#18181b]" : "bg-[#18181b] text-[#f4f4f5]"
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0 ${
        isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"
      }`}>
        <div className="flex items-center gap-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${
            isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
          }`}>
            Argument Text
          </h2>
          {!isMobileInput && onThemeModeChange && (
            <button
              type="button"
              onClick={() => onThemeModeChange(isLight ? "dark" : "light")}
              title={isLight ? "Dark mode" : "Light mode"}
              className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                isLight ? "hover:bg-[#f4f4f5] text-[#71717a]" : "hover:bg-[#27272a] text-[#a1a1aa]"
              }`}
            >
              {isLight ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
            </button>
          )}
        </div>
        {isMobileInput && onClose && (
          <button onClick={onClose} className={`p-1 transition-colors cursor-pointer ${
            isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
          }`}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Presets */}
        <div className={`text-xs font-medium uppercase tracking-wider ${
          isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
        }`}>
          Presets
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => { onPresetSelect(""); onInputTextChange(""); }}
            className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer ${
              !selectedPreset
                ? isLight ? "bg-[#e0e7ff] text-[#4338ca] font-medium" : "bg-[#1e1b4b] text-[#a5b4fc] font-medium"
                : isLight ? "hover:bg-[#f4f4f5] text-[#71717a]" : "hover:bg-[#27272a] text-[#a1a1aa]"
            }`}
          >
            Custom Input
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPresetSelect(p.id); onInputTextChange(p.text); }}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                selectedPreset === p.id
                  ? isLight ? "bg-[#e0e7ff] text-[#4338ca] font-medium" : "bg-[#1e1b4b] text-[#a5b4fc] font-medium"
                  : isLight ? "hover:bg-[#f4f4f5] text-[#71717a]" : "hover:bg-[#27272a] text-[#a1a1aa]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Text area */}
        <div className={`text-xs font-medium uppercase tracking-wider ${
          isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
        }`}>
          Text
        </div>
        <textarea
          value={inputText}
          onChange={(e) => { onInputTextChange(e.target.value); onPresetSelect(""); }}
          onKeyDown={handleKeyDown}
          placeholder="Paste argument text or select a preset above..."
          rows={12}
          className={`w-full rounded-md border p-2.5 text-xs leading-relaxed resize-y transition-colors focus:outline-none focus:ring-1 ${
            isLight
              ? "bg-[#f8f9fa] border-[#e4e4e7] text-[#18181b] placeholder-[#a1a1aa] focus:ring-[#2563eb]"
              : "bg-[#09090b] border-[#3f3f46] text-[#f4f4f5] placeholder-[#52525b] focus:ring-[#60a5fa]"
          }`}
        />

        {/* Submit */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`w-full py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            canSubmit
              ? isLight
                ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                : "bg-[#60a5fa] text-[#09090b] hover:bg-[#3b82f6]"
              : isLight
                ? "bg-[#e4e4e7] text-[#a1a1aa] cursor-not-allowed"
                : "bg-[#27272a] text-[#52525b] cursor-not-allowed"
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{pipelineProgress?.message ?? "Analyzing..."}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Analyze Argument</span>
            </>
          )}
        </button>

        {/* Progress info */}
        {isLoading && pipelineProgress && (
          <div className={`rounded-md border p-3 space-y-2 text-xs ${
            isLight ? "bg-[#f8f9fa] border-[#e4e4e7]" : "bg-[#09090b] border-[#3f3f46]"
          }`}>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-[#a1a1aa]" />
              <span className={isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}>
                {displayTime}s
              </span>
              {pipelineProgress.statementsFound > 0 && (
                <>
                  <Hash className="w-3 h-3 text-[#a1a1aa]" />
                  <span className={isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}>
                    {pipelineProgress.statementsFound} stmt
                  </span>
                </>
              )}
            </div>
            {pipelineProgress.stage === "complete" && (
              <div className="flex items-center gap-1.5 text-[#22c55e]">
                <AlertTriangle className="w-3 h-3" />
                <span>Analysis complete</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
