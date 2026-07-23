import { useState } from "react";
import type { ApiProvider } from "../types";

interface SettingsPanelProps {
  apiProvider: ApiProvider;
  onApiProviderChange: (provider: ApiProvider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
}

export function SettingsPanel({
  apiProvider,
  onApiProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
}: SettingsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="flex flex-col gap-3.5">
      {/* API Provider Selection with Material Chips */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1">
          <md-icon style={{ fontSize: '16px' }}>api</md-icon>
          API Provider
        </label>
        <md-chip-set>
          <md-filter-chip
            label="DeepSeek"
            selected={apiProvider === "deepseek"}
            onClick={() => onApiProviderChange("deepseek")}
          ></md-filter-chip>
          <md-filter-chip
            label="OpenRouter"
            selected={apiProvider === "openrouter"}
            onClick={() => onApiProviderChange("openrouter")}
          ></md-filter-chip>
        </md-chip-set>
      </div>

      {/* API Key Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1">
          <md-icon style={{ fontSize: '16px' }}>key</md-icon>
          {apiProvider === "openrouter" ? "OpenRouter API Key" : "DeepSeek API Key"}
        </label>
        <div className="relative flex items-center">
          <md-outlined-text-field
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            label={apiProvider === "openrouter" ? "sk-or-v1-..." : "sk-..."}
            oninput={(e: any) => onApiKeyChange(e.target.value)}
            style={{ width: "100%" }}
          >
            <md-icon-button
              slot="trailing-icon"
              onClick={() => setShowApiKey((prev) => !prev)}
              aria-label={showApiKey ? "Hide key" : "Show key"}
            >
              <md-icon>{showApiKey ? "visibility_off" : "visibility"}</md-icon>
            </md-icon-button>
          </md-outlined-text-field>
        </div>
      </div>

      {/* OpenRouter Model Input */}
      {apiProvider === "openrouter" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1">
            <md-icon style={{ fontSize: '16px' }}>psychology</md-icon>
            Model Name
          </label>
          <md-outlined-text-field
            type="text"
            value={model}
            label="e.g. deepseek/deepseek-chat"
            oninput={(e: any) => onModelChange(e.target.value)}
            style={{ width: "100%" }}
          ></md-outlined-text-field>
        </div>
      )}
    </div>
  );
}
