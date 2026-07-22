import { useState, useEffect } from "react";
import type { ApiProvider, PipelineProgress } from "../types";
import { PRESETS } from "../presets";

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
}: InputPanelProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);

  const isComplete = pipelineProgress?.stage === "complete";

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
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <h1 className="text-xl font-bold text-[#cdd6f4]">Argument Graph Analyzer</h1>

      {/* API Provider Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#a6adc8] font-medium">
          API Provider
        </label>
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#1e1e2e] border border-[#45475a] rounded-lg">
          <button
            type="button"
            onClick={() => onApiProviderChange("deepseek")}
            className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              apiProvider === "deepseek"
                ? "bg-[#89b4fa] text-[#1e1e2e] font-semibold"
                : "text-[#a6adc8] hover:text-[#cdd6f4]"
            }`}
          >
            DeepSeek
          </button>
          <button
            type="button"
            onClick={() => onApiProviderChange("openrouter")}
            className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              apiProvider === "openrouter"
                ? "bg-[#89b4fa] text-[#1e1e2e] font-semibold"
                : "text-[#a6adc8] hover:text-[#cdd6f4]"
            }`}
          >
            OpenRouter
          </button>
        </div>
      </div>

      {/* API Key */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#a6adc8] font-medium">
          {apiProvider === "openrouter" ? "OpenRouter API Key" : "DeepSeek API Key"}
        </label>
        <div className="relative flex items-center">
          <input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={apiProvider === "openrouter" ? "sk-or-v1-..." : "sk-..."}
            className="w-full pl-3 pr-9 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                       placeholder:text-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setShowApiKey((prev) => !prev)}
            title={showApiKey ? "Hide API key" : "Show API key"}
            className="absolute right-2 text-[#a6adc8] hover:text-[#cdd6f4] p-1 cursor-pointer transition-colors text-xs"
          >
            {showApiKey ? "👁️" : "🙈"}
          </button>
        </div>
      </div>

      {/* OpenRouter Model Input */}
      {apiProvider === "openrouter" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#a6adc8] font-medium">
            Model Name
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="e.g. deepseek/deepseek-chat"
            className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                       placeholder:text-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors"
          />
        </div>
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
