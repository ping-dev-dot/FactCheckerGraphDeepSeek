import { useState, useEffect } from "react";
import { Sun, Moon, Play, Loader2, AlertTriangle, Clock, Hash, X } from "lucide-react";
import type { ApiProvider, PipelineProgress, ThemeMode } from "../types";
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
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
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
  themeMode = "dark",
  onThemeModeChange,
}: InputPanelProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  const isComplete = pipelineProgress?.stage === "complete";
  const isMobileInput = variant === "mobile-input";
  const isLight = themeMode === "light";

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
  }, [isLoading, pipelineProgress, isComplete]);

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
    <div className={`flex flex-col gap-4 p-4 ${
      isLight ? "bg-[#ffffff]" : "bg-[#18181b]"
    } ${isMobileInput ? "max-h-[60vh] overflow-y-auto" : "h-full overflow-y-auto"}`}>
      {/* Drag handle pill + close button (mobile-input only) */}
      {isMobileInput && (
        <div className="flex items-center justify-between -mt-0.5 mb-1">
          <div className="flex-1 flex justify-center">
            <div className={`w-8 h-1 rounded-full ${isLight ? "bg-[#e4e4e7]" : "bg-[#3f3f46]"}`} />
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className={`transition-colors text-sm leading-none ml-2 flex-shrink-0 cursor-pointer p-1 ${
                isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
              }`}
              aria-label="Close input panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Title + Small Theme Toggle Button — desktop only */}
      {!isMobileInput && (
        <div className={`flex items-center justify-between pb-2.5 border-b ${isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"}`}>
          <div>
            <h1 className={`text-sm font-semibold tracking-tight ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
              Argument Graph Analyzer
            </h1>
            <p className={`text-[11px] mt-0.5 ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
              Extract and verify claim structures
            </p>
          </div>
          {onThemeModeChange && (
            <button
              type="button"
              onClick={() => onThemeModeChange(isLight ? "dark" : "light")}
              title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
              aria-label="Toggle theme mode"
              className={`p-1.5 rounded-md border text-xs transition-colors cursor-pointer flex items-center justify-center ${
                isLight
                  ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] hover:bg-[#f4f4f5]"
                  : "bg-[#27272a] border-[#3f3f46] text-[#f4f4f5] hover:bg-[#3f3f46]"
              }`}
            >
              {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      )}

      {/* Settings section — desktop only */}
      {!isMobileInput && (
        <SettingsPanel
          apiProvider={apiProvider}
          onApiProviderChange={onApiProviderChange}
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
          model={model}
          onModelChange={onModelChange}
          themeMode={themeMode}
        />
      )}

      {/* Preset selector */}
      <div className="flex flex-col gap-1.5">
        <label className={`text-xs font-medium ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
          Example Argument Presets
        </label>
        <select
          value={selectedPreset}
          onChange={handlePresetChange}
          className={`w-full px-3 py-2 rounded-md text-xs border transition-colors cursor-pointer focus:outline-none ${
            isLight
              ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] focus:border-[#71717a]"
              : "bg-[#121215] border-[#3f3f46] text-[#f4f4f5] focus:border-[#71717a]"
          }`}
        >
          <option value="">— Select preset —</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {selectedPreset && (
          <p className={`text-[11px] leading-relaxed ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
            {PRESETS.find((p) => p.id === selectedPreset)?.description}
          </p>
        )}
      </div>

      {/* Text input */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <label className={`text-xs font-medium ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
          Input Argument Text
        </label>
        <textarea
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          placeholder="Paste or type argument text to analyze..."
          className={`flex-1 w-full px-3 py-2 rounded-md text-xs border transition-colors resize-none min-h-[120px] lg:min-h-[150px] leading-relaxed font-normal focus:outline-none ${
            isLight
              ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] placeholder:text-[#a1a1aa] focus:border-[#71717a]"
              : "bg-[#121215] border-[#3f3f46] text-[#f4f4f5] placeholder:text-[#71717a] focus:border-[#71717a]"
          }`}
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
        className={`w-full py-2.5 rounded-md font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 ${
          isLight
            ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa]"
            : "bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:bg-[#27272a] disabled:text-[#71717a]"
        } disabled:cursor-not-allowed`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Analyzing Argument...</span>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Analyze Argument</span>
          </>
        )}
      </button>

      {/* Missing API key hint */}
      {!isLoading && inputText.trim() && (!apiKey.trim() || (apiProvider === "openrouter" && !model.trim())) && (
        <p className="text-[11px] text-[#eab308] text-center leading-relaxed font-medium flex items-center justify-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            API key required.{" "}
            {onOpenSettings ? (
              <button
                onClick={onOpenSettings}
                className="underline hover:opacity-80 transition-opacity cursor-pointer ml-1"
              >
                Open Settings
              </button>
            ) : (
              <span>Provide your {apiProvider === "openrouter" ? "OpenRouter" : "DeepSeek"} API key.</span>
            )}
          </span>
        </p>
      )}

      {/* Time & Accumulated Tokens info bar */}
      {(isLoading || pipelineProgress) && (
        <div className={`flex items-center justify-between py-1.5 px-3 rounded-md border text-[11px] font-mono ${
          isLight
            ? "bg-[#f8f9fa] border-[#e4e4e7] text-[#71717a]"
            : "bg-[#09090b] border-[#3f3f46] text-[#a1a1aa]"
        }`}>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Elapsed: <strong className={`font-normal ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>{displayTime}s</strong></span>
          </span>
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            <span>Tokens: <strong className={`font-normal ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>~{(pipelineProgress?.totalTokens ?? 0).toLocaleString()}</strong></span>
          </span>
        </div>
      )}
    </div>
  );
}




