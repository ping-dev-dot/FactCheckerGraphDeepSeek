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
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
