import { useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { InputPanel } from "./components/InputPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { analyzeArgument } from "./api";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { AnalysisResult, AppStatus, Statement } from "./types";

export default function App() {
  const [apiKey, setApiKey] = useLocalStorage<string>("deepseek-api-key", "");
  const [inputText, setInputText] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedStatement: Statement | null =
    selectedNodeId && result
      ? result.statements.find((s) => s.id === selectedNodeId) ?? null
      : null;

  const handleSubmit = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");
    setResult(null);
    setSelectedNodeId(null);

    try {
      const analysis = await analyzeArgument(inputText, apiKey);
      setResult(analysis);
      setStatus("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unknown error occurred";
      setErrorMessage(message);
      setStatus("error");
    }
  }, [inputText, apiKey]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  return (
    <div className="h-screen w-screen flex bg-[#11111b] overflow-hidden">
      {/* Left panel — input */}
      <div className="w-[360px] flex-shrink-0 border-r border-[#313244] bg-[#1e1e2e] flex flex-col">
        <InputPanel
          inputText={inputText}
          onInputTextChange={setInputText}
          selectedPreset={selectedPreset}
          onPresetSelect={setSelectedPreset}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          onSubmit={handleSubmit}
          isLoading={status === "loading"}
        />

        {/* Error notification */}
        {status === "error" && (
          <div className="mx-4 mb-4 p-3 rounded-lg bg-[#f38ba8]/10 border border-[#f38ba8]/30">
            <p className="text-xs text-[#f38ba8] font-semibold mb-1">
              Error
            </p>
            <p className="text-xs text-[#cdd6f4] leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-2 text-xs text-[#89b4fa] hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Center — graph */}
      <div className="flex-1 min-w-0 relative">
        {result ? (
          <ReactFlowProvider>
            <GraphCanvas
              result={result}
              onNodeClick={handleNodeClick}
              onCanvasClick={handleCanvasClick}
            />
          </ReactFlowProvider>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center px-8">
              {status === "loading" ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-3 border-[#89b4fa] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-[#a6adc8]">
                    Analyzing argument with DeepSeek...
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-4xl mb-2">🧠</div>
                  <p className="text-[#cdd6f4] font-semibold">
                    No analysis yet
                  </p>
                  <p className="text-xs text-[#585b70] max-w-xs">
                    Enter your argument text and API key on the left, then click
                    "Analyze Argument" to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right — detail sidebar */}
      {selectedStatement && result && (
        <DetailSidebar
          statement={selectedStatement}
          result={result}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
