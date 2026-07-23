import { useState, useCallback, useMemo, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Sun, Moon, SlidersHorizontal, Edit3, X, Network, Terminal } from "lucide-react";
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
  ThemeMode,
} from "./types";

export default function App() {
  const [themeMode, setThemeMode] = useLocalStorage<ThemeMode>("theme-mode", "dark");
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

  const isLight = themeMode === "light";

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
    setPipelineProgress({ stage: "preprocessing", message: "Starting pipeline...", statementsFound: 0, totalSteps: 3, currentStep: 0 });

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
    <div className={`h-screen w-screen flex flex-col lg:flex-row overflow-hidden relative font-sans transition-colors ${
      isLight ? "bg-[#f8f9fa] text-[#18181b]" : "bg-[#09090b] text-[#f4f4f5]"
    }`}>
      {/* ================================================================ */}
      {/* Mobile Header Bar (visible on < lg)                              */}
      {/* ================================================================ */}
      <div className={`lg:hidden flex items-center justify-between px-3 py-2 border-b z-30 flex-shrink-0 gap-2 ${
        isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
      }`}>
        <button
          type="button"
          onClick={() => setThemeMode(isLight ? "dark" : "light")}
          title={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label="Toggle theme mode"
          className={`p-1.5 rounded-md border text-xs transition-colors cursor-pointer flex items-center justify-center flex-shrink-0 ${
            isLight
              ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] hover:bg-[#f4f4f5]"
              : "bg-[#27272a] border-[#3f3f46] text-[#f4f4f5] hover:bg-[#3f3f46]"
          }`}
        >
          {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center gap-2 min-w-0 justify-center">
          <span className={`text-xs font-semibold tracking-tight uppercase ${
            isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
          }`}>Argument Graph</span>
          {pipelineProgress && (
            <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded flex-shrink-0 ${
              isLight ? "bg-[#f4f4f5] text-[#71717a]" : "bg-[#27272a] text-[#a1a1aa]"
            }`}>
              {pipelineProgress.stage}
            </span>
          )}
        </div>

        <button
          onClick={() => {
            setMobileSettingsOpen((prev) => !prev);
            setMobileInputOpen(false);
          }}
          className={`px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1.5 cursor-pointer font-medium flex-shrink-0 ${
            isLight ? "bg-[#ffffff] border-[#e4e4e7] text-[#18181b] hover:bg-[#f4f4f5]" : "bg-[#27272a] border-[#3f3f46] text-[#f4f4f5] hover:bg-[#3f3f46]"
          }`}
        >
          {mobileSettingsOpen ? <X className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
          <span>{mobileSettingsOpen ? "Close" : "Settings"}</span>
        </button>
      </div>

      {/* ================================================================ */}
      {/* Mobile Input Drawer — slides down from top                        */}
      {/* ================================================================ */}
      {mobileInputOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileInputOpen(false)}
          />
          <div className={`fixed top-0 left-0 right-0 z-[45] max-h-[60vh] border-b rounded-b-md shadow-xl overflow-y-auto animate-slide-down lg:hidden ${
            isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
          }`}>
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
              themeMode={themeMode}
              onThemeModeChange={setThemeMode}
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
      {/* Mobile Settings Overlay                                          */}
      {/* ================================================================ */}
      {mobileSettingsOpen && (
        <div className={`fixed inset-0 z-50 flex flex-col lg:hidden ${
          isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"
        }`}>
          <div className={`flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0 ${
            isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
          }`}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
            }`}>Settings</h2>
            <button
              onClick={() => setMobileSettingsOpen(false)}
              className={`transition-colors text-base leading-none cursor-pointer p-1 ${
                isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
              }`}
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className={`p-4 overflow-y-auto flex-1 ${
            isLight ? "bg-[#ffffff]" : "bg-[#18181b]"
          }`}>
            <SettingsPanel
              apiProvider={apiProvider}
              onApiProviderChange={setApiProvider}
              apiKey={currentApiKey}
              onApiKeyChange={handleApiKeyChange}
              model={openrouterModel}
              onModelChange={setOpenrouterModel}
              themeMode={themeMode}
            />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Desktop Left Panel — InputPanel + Debug Logs Footer              */}
      {/* ================================================================ */}
      <div className={`hidden lg:flex w-[350px] flex-shrink-0 border-r flex-col h-full overflow-hidden ${
        isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
      }`}>
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
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          variant="desktop"
        />

        {/* Global Debug Logs Footer */}
        <div className={`px-4 pb-3 pt-2 flex items-center justify-between border-t ${
          isLight ? "border-[#e4e4e7] bg-[#ffffff]" : "border-[#3f3f46] bg-[#18181b]"
        }`}>
          <button
            onClick={() => setShowLogs((prev) => !prev)}
            className={`text-xs transition-colors flex items-center gap-1.5 cursor-pointer font-medium ${
              isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{showLogs ? "Hide Logs" : "Show Logs"}</span>
            {logs.length > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] rounded font-mono ${
                isLight ? "bg-[#f4f4f5] text-[#71717a]" : "bg-[#27272a] text-[#a1a1aa]"
              }`}>
                {logs.length}
              </span>
            )}
          </button>
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-[11px] text-[#71717a] hover:text-[#ef4444] transition-colors cursor-pointer font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Center — graph canvas                                           */}
      {/* ================================================================ */}
      <div className={`flex-1 min-w-0 relative h-full w-full ${
        isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"
      }`}>
        {/* Floating input trigger — mobile only */}
        <button
          onClick={() => setMobileInputOpen(true)}
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 
                     rounded-md text-white font-medium text-xs
                     transition-colors cursor-pointer shadow-sm
                     lg:hidden flex items-center gap-1.5 ${
                       isLight ? "bg-[#2563eb] hover:bg-[#1d4ed8]" : "bg-[#3b82f6] hover:bg-[#2563eb]"
                     }`}
          aria-label="Open input panel"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Input Panel</span>
        </button>

        {displayResult && displayResult.statements && displayResult.statements.length > 0 ? (
          <ReactFlowProvider>
            <GraphCanvas
              result={displayResult}
              onNodeClick={handleNodeClick}
              onCanvasClick={handleCanvasClick}
              themeMode={themeMode}
            />
          </ReactFlowProvider>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center px-6 max-w-sm">
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
                  themeMode={themeMode}
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className={`w-9 h-9 rounded-full border flex items-center justify-center mb-1 ${
                    isLight ? "border-[#e4e4e7] bg-[#ffffff] text-[#71717a]" : "border-[#3f3f46] bg-[#18181b] text-[#a1a1aa]"
                  }`}>
                    <Network className="w-4 h-4" />
                  </div>
                  <p className={`text-sm font-medium tracking-tight ${
                    isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
                  }`}>
                    No Argument Analyzed
                  </p>
                  <p className={`text-xs leading-relaxed ${
                    isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
                  }`}>
                    Select an example preset or enter text on the left panel to map argument structure and evaluate fact-check difficulty.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {/* ================================================================ */}
      {/* Right — detail sidebar                                           */}
      {/* ================================================================ */}
      {selectedStatement && displayResult && (
        <DetailSidebar
          statement={selectedStatement}
          result={displayResult}
          onClose={() => setSelectedNodeId(null)}
          themeMode={themeMode}
        />
      )}

      {/* ================================================================ */}
      {/* Error notification float                                         */}
      {/* ================================================================ */}
      {status === "error" && (
        <div className={`fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-[360px] z-50 p-3 rounded-md border shadow-lg ${
          isLight ? "bg-[#ffffff] border-[#ef4444]/40" : "bg-[#161618] border-[#ef4444]/40"
        }`}>
          <p className="text-xs text-[#ef4444] font-medium mb-1 uppercase tracking-wider">Analysis Failed</p>
          <p className={`text-xs leading-relaxed ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
            {errorMessage}
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-2 text-xs text-[#2563eb] hover:underline cursor-pointer font-medium"
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
          themeMode={themeMode}
        />
      )}
    </div>
  );
}


