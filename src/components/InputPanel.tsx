import { useState, useEffect } from "react";
import type { ApiProvider, PipelineProgress } from "../types";
import { PRESETS } from "../presets";
import { SettingsPanel } from "./SettingsPanel";

interface InputPanelProps {
  inputText: string;
  onInputTextChange: (text: string) => void;
  selectedPreset: string;
  onPresetSelect: (presetId: string) => void;
  apiProvider: ApiProvider;
  onApiProviderChange: (provider: ApiProvider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  pipelineProgress?: PipelineProgress | null;
  /** "desktop" shows all sections; "mobile-input" hides title + settings (shown in SettingsPanel overlay) */
  variant?: "desktop" | "mobile-input";
  /** Close callback — only used in mobile-input variant */
  onClose?: () => void;
  /** Open settings — for hint link when API key is missing */
  onOpenSettings?: () => void;
}

export function InputPanel({
  inputText,
  onInputTextChange,
  selectedPreset,
  onPresetSelect,
  apiProvider,
  onApiProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  onSubmit,
  isLoading,
  pipelineProgress,
  variant = "desktop",
  onClose,
  onOpenSettings,
}: InputPanelProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  const isComplete = pipelineProgress?.stage === "complete";
  const isMobileInput = variant === "mobile-input";

useEffect(() => {
  if (!isLoading) {
    setElapsedSec(0);
    return;
  }
  if (!pipelineProgress || isComplete) return;
  const start = Date.now() - (pipelineProgress.elapsedMs ?? 0);
  setElapsedSec(Math.max(0, (pipelineProgress.elapsedMs ?? 0) / 1000));
  const interval = setInterval(() => {
    setElapsedSec(Math.max(0, (Date.now() - start) / 1000));
  }, 100);
  return () => clearInterval(interval);
  }, [isLoading, pipelineProgress?.stage, isComplete, pipelineProgress?.elapsedMs]);

  const displayTime = isComplete
    ? ((pipelineProgress?.elapsedMs ?? (elapsedSec * 1000)) / 1000).toFixed(1)
    : elapsedSec.toFixed(1);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    onPresetSelect(id);
    if (id) {
      const preset = PRESETS.find((p) => p.id === id);
      if (preset) {
        onInputTextChange(preset.text);
      }
    }
  };

  return (
    <div className={`flex flex-col gap-4 p-4 ${isMobileInput ? "max-h-[60vh] overflow-y-auto" : "h-full overflow-y-auto"}`}>
      {/* Drag handle pill + close button (mobile-input only) */}
      {isMobileInput && (
        <div className="flex items-center justify-between -mt-0.5 mb-1">
          <div className="flex-1 flex justify-center">
            <div className="w-10 h-1.5 rounded-full bg-[#45475a]" />
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[#585b70] hover:text-[#cdd6f4] transition-colors text-lg leading-none ml-2 flex-shrink-0 cursor-pointer"
              aria-label="Close input panel"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Title — desktop only */}
      {!isMobileInput && (
        <h1 className="text-xl font-bold text-[#cdd6f4]">Argument Graph Analyzer</h1>
      )}

      {/* Settings section — desktop only (shown via SettingsPanel in mobile overlay) */}
      {!isMobileInput && (
        <SettingsPanel
          apiProvider={apiProvider}
          onApiProviderChange={onApiProviderChange}
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
          model={model}
          onModelChange={onModelChange}
        />
      )}

      {/* Preset selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#a6adc8] font-medium">
          Example Arguments
        </label>
        <select
          value={selectedPreset}
          onChange={handlePresetChange}
          className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                     focus:outline-none focus:border-[#89b4fa] transition-colors cursor-pointer"
        >
          <option value="">— Select a preset —</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {selectedPreset && (
          <p className="text-xs text-[#585b70] mt-1">
            {PRESETS.find((p) => p.id === selectedPreset)?.description}
          </p>
        )}
      </div>

      {/* Text input */}
      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <label className="text-xs text-[#a6adc8] font-medium">
          Argument Text
        </label>
        <textarea
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          placeholder="Paste or type your argument here..."
          className="flex-1 w-full px-3 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                     placeholder:text-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors resize-none
                     min-h-[120px] lg:min-h-[150px]"
        />
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={
          isLoading ||
          !inputText.trim() ||
          !apiKey.trim() ||
          (apiProvider === "openrouter" && !model.trim())
        }
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer
                   bg-[#89b4fa] text-[#1e1e2e] hover:bg-[#74c7ec] 
                   disabled:bg-[#45475a] disabled:text-[#585b70] disabled:cursor-not-allowed
                   active:scale-[0.98]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-[#1e1e2e] border-t-transparent rounded-full animate-spin" />
            Analyzing...
          </span>
        ) : (
          "Analyze Argument"
        )}
      </button>

      {/* Missing API key hint — shows when text is filled but key is missing */}
      {!isLoading && inputText.trim() && (!apiKey.trim() || (apiProvider === "openrouter" && !model.trim())) && (
        <p className="text-xs text-[#f9e2af] text-center leading-relaxed">
          ⚠️ API key required.{" "}
          {onOpenSettings ? (
            <button
              onClick={onOpenSettings}
              className="underline hover:text-[#f38ba8] transition-colors cursor-pointer font-medium"
            >
              Open Settings
            </button>
          ) : (
            <span>Enter your {apiProvider === "openrouter" ? "OpenRouter" : "DeepSeek"} API key above.</span>
          )}
        </p>
      )}

      {/* Time & Accumulated Tokens info bar */}
      {(isLoading || pipelineProgress) && (
        <div className="flex items-center justify-center gap-3 py-2 px-3 rounded-lg bg-[#11111b] border border-[#313244] text-xs font-mono">
          <span className="flex items-center gap-1.5 text-[#a6adc8]">
            ⏱ <span className="text-[#cdd6f4] font-semibold">{displayTime}s</span>
          </span>
          <span className="text-[#313244]">|</span>
          <span className="flex items-center gap-1.5 text-[#a6adc8]">
            🔤 <span className="text-[#89b4fa] font-semibold">~{(pipelineProgress?.totalTokens ?? 0).toLocaleString()}</span> tokens
          </span>
        </div>
      )}
    </div>
  );
}
