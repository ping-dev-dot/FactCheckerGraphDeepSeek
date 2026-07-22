import { useState, useCallback, useMemo, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { InputPanel } from "./components/InputPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { PipelineProgress } from "./components/PipelineProgress";
import { DebugLogConsole } from "./components/DebugLogConsole";
import { SettingsPanel } from "./components/SettingsPanel";
import { runAnalysisPipeline, PipelineStepError } from "./api";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type {
  AnalysisResult,
  ApiProvider,
  ApiSettings,
  AppStatus,
  LogEntry,
  PartialAnalysisResult,
  PipelineProgress as PipelineProgressType,
  Statement,
} from "./types";

export default function App() {
  const [apiProvider, setApiProvider] = useLocalStorage<ApiProvider>("api-provider", "deepseek");
  const [deepseekApiKey, setDeepseekApiKey] = useLocalStorage<string>("deepseek-api-key", "");
  const [openrouterApiKey, setOpenrouterApiKey] = useLocalStorage<string>("openrouter-api-key", "");
  const [openrouterModel, setOpenrouterModel] = useLocalStorage<string>("openrouter-model", "deepseek/deepseek-chat");

  const [inputText, setInputText] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [partialResult, setPartialResult] = useState<PartialAnalysisResult | null>(null);
  const [pipelineProgress, setPipelineProgress] =
    useState<PipelineProgressType | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Mobile overlay states — split input and settings
  const [mobileInputOpen, setMobileInputOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const currentApiKey = apiProvider === "openrouter" ? openrouterApiKey : deepseekApiKey;
  const currentModel = apiProvider === "openrouter" ? openrouterModel : "deepseek-chat";

  const handleApiKeyChange = (key: string) => {
    if (apiProvider === "openrouter") {
      setOpenrouterApiKey(key);
    } else {
      setDeepseekApiKey(key);
    }
  };

  const apiSettings: ApiSettings = useMemo(
    () => ({
      provider: apiProvider,
      apiKey: currentApiKey,
      model: currentModel,
    }),
    [apiProvider, currentApiKey, currentModel]
  );

  // Cache for retry: keep text/apiSettings and step 1 results across retries
  const retryCache = useRef<{
    text: string;
    apiSettings: ApiSettings;
    statements?: Statement[];
  } | null>(null);

  // Determine display result: full result takes priority, partial as fallback
  const displayResult: AnalysisResult | PartialAnalysisResult | null =
    result ?? partialResult;

  const selectedStatement: Statement | null =
    selectedNodeId && displayResult?.statements
      ? displayResult.statements.find((s) => s.id === selectedNodeId) ?? null
      : null;

  const handleSubmit = useCallback(async () => {
    // Close all mobile overlays on submit
    setMobileInputOpen(false);
    setMobileSettingsOpen(false);
    setStatus("running");
    setErrorMessage("");
    setResult(null);
    setPartialResult(null);
    setSelectedNodeId(null);
    setPipelineProgress({ stage: "preprocessing", message: "Starting...", statementsFound: 0, totalSteps: 3, currentStep: 0 });

    retryCache.current = { text: inputText, apiSettings };

    try {
      const finalResult = await runAnalysisPipeline(
        inputText,
        apiSettings,
        // onProgress
        (progress) => {
          setPipelineProgress(progress);
          if (progress.stage === "extracting") {
            setStatus("running");
          }
        },
        // onStatements
        (statements) => {
          setPartialResult((prev) => ({
            ...prev,
            statements,
          }));
          setStatus("partial");
        },
        // onPartialResult
        (partial) => {
          setPartialResult(partial);
          setStatus("partial");
        },
        // onLog
        addLog
      );
      setResult(finalResult);
      setStatus("success");
      setPipelineProgress((prev) => (prev ? { ...prev, stage: "complete" } : prev));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unknown error occurred";
      setErrorMessage(message);

      if (err instanceof PipelineStepError) {
        // Partial results available — keep showing what we have
        setPartialResult(err.partialResult);
        setStatus("partial");
      } else if (partialResult?.statements?.length) {
        // Step 1 succeeded but step 2/3 threw non-pipeline error
        setStatus("partial");
      } else {
        setStatus("error");
      }
    }
  }, [inputText, apiSettings, partialResult, addLog]);

  // Retry from step 2 (cached step 1 results)
  const handleRetry = useCallback(async () => {
    const cache = retryCache.current;
    if (!cache?.statements?.length || !cache.apiSettings.apiKey) return;

    setStatus("running");
    setErrorMessage("");
    setPipelineProgress({ stage: "analyzing_relations", message: "Retrying relation analysis...", statementsFound: cache.statements.length, totalSteps: 3, currentStep: 2 });

    try {
      const finalResult = await runAnalysisPipeline(
        cache.text,
        cache.apiSettings,
        (progress) => setPipelineProgress(progress),
        (statements) => {
          setPartialResult((prev) => ({ ...prev, statements }));
        },
        (partial) => {
          setPartialResult(partial);
          setStatus("partial");
        },
        addLog
      );
      setResult(finalResult);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setErrorMessage(message);
      setStatus("partial");
    }
  }, [addLog]);

  // View partial results only (dismiss error, show statements)
  const handleViewPartial = useCallback(() => {
    setErrorMessage("");
    setStatus("partial");
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  // Close input drawer on canvas click
  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setMobileInputOpen(false);
  }, []);

  const isRunning = status === "running" || status === "partial";

  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row bg-[#11111b] overflow-hidden relative">
      {/* ================================================================ */}
      {/* Mobile Header Bar (visible on < lg)                              */}
      {/* Layout: [title + stage]  ...  [⚙️ Settings]                       */}
      {/* ================================================================ */}
      <div className="lg:hidden flex items-center justify-between px-3 py-2.5 bg-[#1e1e2e] border-b border-[#313244] z-30 flex-shrink-0 gap-2">
        {/* Spacer for balance (left) */}
        <div className="w-[44px] flex-shrink-0" />

        {/* Title + stage badge (center) */}
        <div className="flex items-center gap-1.5 min-w-0 justify-center">
          <span className="text-sm font-bold text-[#cdd6f4] truncate">Argument Graph</span>
          {pipelineProgress && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-[#313244] text-[#89b4fa] flex-shrink-0">
              {pipelineProgress.stage}
            </span>
          )}
        </div>

        {/* Settings toggle button (right) */}
        <button
          onClick={() => {
            setMobileSettingsOpen((prev) => !prev);
            setMobileInputOpen(false);
          }}
          className="px-2.5 py-1.5 text-xs rounded-lg bg-[#313244] text-[#cdd6f4] hover:bg-[#45475a] transition-colors flex items-center gap-1 cursor-pointer font-medium border border-[#45475a] flex-shrink-0"
        >
          <span>{mobileSettingsOpen ? "✕" : "⚙️"}</span>
        </button>
      </div>

      {/* ================================================================ */}
      {/* Mobile Input Drawer — slides down from top, partial overlay      */}
      {/* ================================================================ */}
      {mobileInputOpen && (
        <>
          {/* Semi-transparent backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileInputOpen(false)}
          />
          {/* Slide-down panel */}
          <div className="fixed top-0 left-0 right-0 z-[45] max-h-[60vh] bg-[#1e1e2e] border-b border-[#313244] rounded-b-xl shadow-2xl overflow-y-auto animate-slide-down lg:hidden">
            <InputPanel
              inputText={inputText}
              onInputTextChange={setInputText}
              selectedPreset={selectedPreset}
              onPresetSelect={setSelectedPreset}
              apiProvider={apiProvider}
              onApiProviderChange={setApiProvider}
              apiKey={currentApiKey}
              onApiKeyChange={handleApiKeyChange}
              model={openrouterModel}
              onModelChange={setOpenrouterModel}
              onSubmit={handleSubmit}
              isLoading={isRunning}
              pipelineProgress={pipelineProgress}
              variant="mobile-input"
              onClose={() => setMobileInputOpen(false)}
              onOpenSettings={() => {
                setMobileInputOpen(false);
                setMobileSettingsOpen(true);
              }}
            />
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* Mobile Settings Overlay — full-screen with its own close button  */}
      {/* ================================================================ */}
      {mobileSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-[#11111b] flex flex-col lg:hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#1e1e2e] border-b border-[#313244] flex-shrink-0">
            <h2 className="text-sm font-bold text-[#cdd6f4]">Settings</h2>
            <button
              onClick={() => setMobileSettingsOpen(false)}
              className="text-[#a6adc8] hover:text-[#cdd6f4] transition-colors text-lg leading-none cursor-pointer p-1"
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            <SettingsPanel
              apiProvider={apiProvider}
              onApiProviderChange={setApiProvider}
              apiKey={currentApiKey}
              onApiKeyChange={handleApiKeyChange}
              model={openrouterModel}
              onModelChange={setOpenrouterModel}
            />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Desktop Left Panel — full InputPanel with settings               */}
      {/* ================================================================ */}
      <div className="hidden lg:flex w-[360px] flex-shrink-0 border-r border-[#313244] bg-[#1e1e2e] flex-col h-full overflow-hidden">
        <InputPanel
          inputText={inputText}
          onInputTextChange={setInputText}
          selectedPreset={selectedPreset}
          onPresetSelect={setSelectedPreset}
          apiProvider={apiProvider}
          onApiProviderChange={setApiProvider}
          apiKey={currentApiKey}
          onApiKeyChange={handleApiKeyChange}
          model={openrouterModel}
          onModelChange={setOpenrouterModel}
          onSubmit={handleSubmit}
          isLoading={isRunning}
          pipelineProgress={pipelineProgress}
          variant="desktop"
        />

        {/* Global Debug Logs Button */}
        <div className="px-4 pb-3 flex items-center justify-between border-t border-[#313244] pt-2">
          <button
            onClick={() => setShowLogs((prev) => !prev)}
            className="text-xs text-[#a6adc8] hover:text-[#cdd6f4] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>📋 {showLogs ? "Hide Logs" : "Show Logs"}</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[#313244] text-[#89b4fa] font-mono font-semibold">
                {logs.length}
              </span>
            )}
          </button>
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-[11px] text-[#585b70] hover:text-[#f38ba8] transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Center — graph (flex-1 on mobile and desktop)                    */}
      {/* ================================================================ */}
      <div className="flex-1 min-w-0 relative h-full w-full">
        {/* Floating input trigger — mobile only, always visible */}
        <button
          onClick={() => setMobileInputOpen(true)}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 
                     rounded-full bg-[#89b4fa] text-[#1e1e2e] font-semibold text-sm
                     hover:bg-[#74c7ec] transition-colors cursor-pointer shadow-lg
                     lg:hidden flex items-center gap-1.5"
          aria-label="Open input panel"
        >
          <span className="text-base leading-none">▼</span>
          <span>Input</span>
        </button>

        {displayResult && displayResult.statements && displayResult.statements.length > 0 ? (
          <ReactFlowProvider>
            <GraphCanvas
              result={displayResult}
              onNodeClick={handleNodeClick}
              onCanvasClick={handleCanvasClick}
            />
          </ReactFlowProvider>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center px-8">
              {isRunning && pipelineProgress ? (
                <PipelineProgress
                  progress={pipelineProgress}
                  errorMessage={
                    status === "partial" && errorMessage ? errorMessage : undefined
                  }
                  isPartial={
                    status === "partial" && !!partialResult?.statements?.length
                  }
                  onRetry={
                    status === "partial" && errorMessage
                      ? handleRetry
                      : undefined
                  }
                  onViewPartial={
                    status === "partial" && errorMessage && partialResult?.statements?.length
                      ? handleViewPartial
                      : undefined
                  }
                  logCount={logs.length}
                  showLogs={showLogs}
                  onToggleLogs={() => setShowLogs((prev) => !prev)}
                />
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

      {/* ================================================================ */}
      {/* Right — detail sidebar (overlay on mobile, fixed on desktop)     */}
      {/* ================================================================ */}
      {selectedStatement && displayResult && (
        <DetailSidebar
          statement={selectedStatement}
          result={displayResult}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      {/* ================================================================ */}
      {/* Error notification — floating toast, always visible              */}
      {/* ================================================================ */}
      {status === "error" && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-[360px] z-50 p-3 rounded-lg bg-[#f38ba8]/10 border border-[#f38ba8]/30 shadow-lg backdrop-blur-sm">
          <p className="text-xs text-[#f38ba8] font-semibold mb-1">Error</p>
          <p className="text-xs text-[#cdd6f4] leading-relaxed">
            {errorMessage}
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-2 text-xs text-[#89b4fa] hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* Floating Debug Log Console                                       */}
      {/* ================================================================ */}
      {showLogs && (
        <DebugLogConsole
          logs={logs}
          onClear={clearLogs}
          onClose={() => setShowLogs(false)}
        />
      )}
    </div>
  );
}
