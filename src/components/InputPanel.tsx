import { PRESETS } from "../presets";

interface InputPanelProps {
  inputText: string;
  onInputTextChange: (text: string) => void;
  selectedPreset: string;
  onPresetSelect: (presetId: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  braveApiKey: string;
  onBraveApiKeyChange: (key: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function InputPanel({
  inputText,
  onInputTextChange,
  selectedPreset,
  onPresetSelect,
  apiKey,
  onApiKeyChange,
  braveApiKey,
  onBraveApiKeyChange,
  onSubmit,
  isLoading,
}: InputPanelProps) {
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

      {/* API Key */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#a6adc8] font-medium">
          DeepSeek API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                     placeholder:text-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors"
        />
      </div>

      {/* Brave API Key (optional) */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#a6adc8] font-medium">
          Brave Search API Key{" "}
          <span className="text-[#585b70]">(optional)</span>
        </label>
        <input
          type="password"
          value={braveApiKey}
          onChange={(e) => onBraveApiKeyChange(e.target.value)}
          placeholder="Add a Brave key to enable web fact-checking"
          className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                     placeholder:text-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors"
        />
      </div>

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
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#a6adc8] font-medium">
          Argument Text
        </label>
        <textarea
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          placeholder="Paste or type your argument here..."
          className="w-full px-3 py-2 bg-[#1e1e2e] border border-[#45475a] rounded-lg text-[#cdd6f4] text-sm
                     placeholder:text-[#585b70] focus:outline-none focus:border-[#89b4fa] transition-colors resize-none
                     h-[120px] lg:h-[150px]"
        />
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={isLoading || !inputText.trim() || !apiKey.trim()}
        className="flex-shrink-0 w-full py-2.5 rounded-lg font-semibold text-sm transition-all duration-200
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
    </div>
  );
}
