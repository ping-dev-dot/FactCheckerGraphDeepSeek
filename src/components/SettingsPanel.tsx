import { useState } from "react";
import { Eye, EyeOff, Cpu, Globe } from "lucide-react";
import type { ApiProvider, ThemeMode } from "../types";

interface SettingsPanelProps {
  apiProvider: ApiProvider;
  onApiProviderChange: (provider: ApiProvider) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  themeMode?: ThemeMode;
}

export function SettingsPanel({
  apiProvider,
  onApiProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  themeMode = "dark",
}: SettingsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const isLight = themeMode === "light";

  return (
    <div className="flex flex-col gap-4">
      {/* API Provider Selector */}
      <div className="flex flex-col gap-1.5">
        <label className={`text-xs font-medium ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
          API Provider
        </label>
        <div className={`grid grid-cols-2 gap-1 p-1 rounded-md border ${
          isLight ? "bg-[#f4f4f5] border-[#e4e4e7]" : "bg-[#121215] border-[#3f3f46]"
        }`}>
          <button
            type="button"
            onClick={() => onApiProviderChange("deepseek")}
            className={`py-1.5 px-3 rounded text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              apiProvider === "deepseek"
                ? isLight ? "bg-[#ffffff] text-[#18181b] shadow-sm font-semibold" : "bg-[#27272a] text-[#f4f4f5]"
                : isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>DeepSeek</span>
          </button>
          <button
            type="button"
            onClick={() => onApiProviderChange("openrouter")}
            className={`py-1.5 px-3 rounded text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              apiProvider === "openrouter"
                ? isLight ? "bg-[#ffffff] text-[#18181b] shadow-sm font-semibold" : "bg-[#27272a] text-[#f4f4f5]"
                : isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>OpenRouter</span>
          </button>
        </div>
      </div>

      {/* API Key */}
      <div className="flex flex-col gap-1.5">
        <label className={`text-xs font-medium ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
          {apiProvider === "openrouter" ? "OpenRouter API Key" : "DeepSeek API Key"}
        </label>
        <div className="relative flex items-center">
          <input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={apiProvider === "openrouter" ? "sk-or-v1-..." : "sk-..."}
            className={`w-full pl-3 pr-10 py-2 rounded-md text-xs font-mono border transition-colors focus:outline-none ${
              isLight
                ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] placeholder:text-[#a1a1aa] focus:border-[#71717a]"
                : "bg-[#121215] border-[#3f3f46] text-[#f4f4f5] placeholder:text-[#71717a] focus:border-[#71717a]"
            }`}
          />
          <button
            type="button"
            onClick={() => setShowApiKey((prev) => !prev)}
            title={showApiKey ? "Hide API key" : "Show API key"}
            className={`absolute right-2.5 p-1 cursor-pointer transition-colors ${
              isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
          >
            {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* OpenRouter Model Input */}
      {apiProvider === "openrouter" && (
        <div className="flex flex-col gap-1.5">
          <label className={`text-xs font-medium ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
            Model Name
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="e.g. deepseek/deepseek-chat"
            className={`w-full px-3 py-2 rounded-md text-xs border transition-colors focus:outline-none ${
              isLight
                ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] placeholder:text-[#a1a1aa] focus:border-[#71717a]"
                : "bg-[#121215] border-[#3f3f46] text-[#f4f4f5] placeholder:text-[#71717a] focus:border-[#71717a]"
            }`}
          />
        </div>
      )}
    </div>
  );
}




