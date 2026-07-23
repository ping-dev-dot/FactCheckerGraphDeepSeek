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

  const handlePresetSelect = (id: string) => {
    onPresetSelect(id);
    if (id) {
      const preset = PRESETS.find((p) => p.id === id);
      if (preset) {
        onInputTextChange(preset.text);
      }
    }
  };

  const isSubmitDisabled =
    isLoading ||
    !inputText.trim() ||
    !apiKey.trim() ||
    (apiProvider === "openrouter" && !model.trim());

  return (
    <div className={`flex flex-col gap-4 p-4 ${isMobileInput ? "max-h-[75vh] overflow-y-auto" : "h-full overflow-y-auto"}`}>
      {/* Mobile drawer header with clean title & close button */}
      {isMobileInput && (
        <div className="flex items-center justify-between pb-2 border-b border-[var(--md-sys-color-outline-variant)] flex-shrink-0">
          <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
            Argument Input
          </span>
          {onClose && (
            <md-icon-button onClick={onClose} aria-label="Close input panel">
              <md-icon>close</md-icon>
            </md-icon-button>
          )}
        </div>
      )}

      {/* Title (desktop) */}
      {!isMobileInput && (
        <h1 className="text-lg font-bold tracking-tight text-[var(--md-sys-color-on-surface)] flex-shrink-0">
          Argument Graph Analyzer
        </h1>
      )}

      {/* Settings section — desktop only */}
      {!isMobileInput && (
        <div className="flex-shrink-0">
          <SettingsPanel
            apiProvider={apiProvider}
            onApiProviderChange={onApiProviderChange}
            apiKey={apiKey}
            onApiKeyChange={onApiKeyChange}
            model={model}
            onModelChange={onModelChange}
          />
        </div>
      )}

      {!isMobileInput && <md-divider></md-divider>}

      {/* Preset selector */}
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] inline-flex items-center gap-1">
          <md-icon style={{ fontSize: '16px' }}>lightbulb</md-icon>
          Example Arguments
        </label>
        <md-outlined-select
          value={selectedPreset}
          label="Select Preset"
          onchange={(e: any) => handlePresetSelect(e.target.value)}
        >
          <md-select-option value="">
            <div slot="headline">— Select a preset —</div>
          </md-select-option>
          {PRESETS.map((p) => (
            <md-select-option key={p.id} value={p.id} selected={selectedPreset === p.id}>
              <div slot="headline">{p.label}</div>
            </md-select-option>
          ))}
        </md-outlined-select>
        {selectedPreset && (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] italic mt-0.5">
            {PRESETS.find((p) => p.id === selectedPreset)?.description}
          </p>
        )}
      </div>

      {/* Text input — multiline with type="textarea" */}
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] inline-flex items-center gap-1">
          <md-icon style={{ fontSize: '16px' }}>edit_note</md-icon>
          Argument Text
        </label>
        <md-outlined-text-field
          type="textarea"
          rows={isMobileInput ? 4 : 6}
          label="Paste or type your argument here..."
          value={inputText}
          oninput={(e: any) => onInputTextChange(e.target.value)}
          style={{ width: "100%" }}
        ></md-outlined-text-field>
      </div>

      {/* Submit Button */}
      <div className="w-full flex-shrink-0 pt-1">
        <md-filled-button
          disabled={isSubmitDisabled}
          onClick={onSubmit}
          style={{ width: "100%" }}
        >
          {isLoading ? (
            <>
              <md-circular-progress slot="icon" indeterminate style={{ width: "18px", height: "18px" }}></md-circular-progress>
              Analyzing...
            </>
          ) : (
            <>
              <md-icon slot="icon">analytics</md-icon>
              Analyze Argument
            </>
          )}
        </md-filled-button>
      </div>

      {/* Missing API key hint */}
      {!isLoading && inputText.trim() && (!apiKey.trim() || (apiProvider === "openrouter" && !model.trim())) && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] text-xs text-center">
          <md-icon style={{ fontSize: '18px' }}>warning</md-icon>
          <span>API key required.</span>
          {onOpenSettings ? (
            <button
              onClick={onOpenSettings}
              className="underline font-semibold cursor-pointer ml-1"
            >
              Open Settings
            </button>
          ) : (
            <span className="font-semibold ml-1">Enter key above.</span>
          )}
        </div>
      )}

      {/* Time & Accumulated Tokens info bar */}
      {(isLoading || pipelineProgress) && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 py-2 px-3 rounded-lg bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] text-xs font-mono">
          <span className="inline-flex items-center gap-1 text-[var(--md-sys-color-on-surface-variant)]">
            <md-icon style={{ fontSize: '14px' }}>timer</md-icon>
            <span className="text-[var(--md-sys-color-on-surface)] font-semibold">{displayTime}s</span>
          </span>
          <span className="text-[var(--md-sys-color-outline)]">|</span>
          <span className="inline-flex items-center gap-1 text-[var(--md-sys-color-on-surface-variant)]">
            <md-icon style={{ fontSize: '14px' }}>token</md-icon>
            <span className="text-[var(--md-sys-color-primary)] font-semibold">~{(pipelineProgress?.totalTokens ?? 0).toLocaleString()}</span> tokens
          </span>
        </div>
      )}
    </div>
  );
}
