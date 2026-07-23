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
    <div className="h-screen w-screen flex flex-col lg:flex-row bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] overflow-hidden relative font-sans">
      {/* Mobile Header Bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)] z-30 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-bold text-[var(--md-sys-color-on-surface)] truncate">Argument Graph</span>
          {pipelineProgress && (
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] font-semibold flex-shrink-0">
              {pipelineProgress.stage}
            </span>
          )}
        </div>

        <md-icon-button
          onClick={() => {
            setMobileSettingsOpen((prev) => !prev);
            setMobileInputOpen(false);
          }}
          aria-label="Toggle settings"
        >
          <md-icon>{mobileSettingsOpen ? "close" : "settings"}</md-icon>
        </md-icon-button>
      </div>

      {/* Mobile Input Drawer */}
      {mobileInputOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
            onClick={() => setMobileInputOpen(false)}
          />
          <div className="fixed top-0 left-0 right-0 z-[45] max-h-[60vh] bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)] rounded-b-2xl shadow-2xl overflow-y-auto animate-slide-down lg:hidden">
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

      {/* Mobile Settings Overlay */}
      {mobileSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--md-sys-color-surface)] flex flex-col lg:hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <md-icon style={{ fontSize: '20px', color: "var(--md-sys-color-primary)" }}>settings</md-icon>
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">Settings</h2>
            </div>
            <md-icon-button onClick={() => setMobileSettingsOpen(false)} aria-label="Close settings">
              <md-icon>close</md-icon>
            </md-icon-button>
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

      {/* Desktop Left Panel */}
      <div className="hidden lg:flex w-[360px] flex-shrink-0 border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] flex-col h-full overflow-hidden">
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
        <div className="px-4 pb-3 flex items-center justify-between border-t border-[var(--md-sys-color-outline-variant)] pt-2">
          <button
            onClick={() => setShowLogs((prev) => !prev)}
            className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <md-icon style={{ fontSize: '16px' }}>terminal</md-icon>
            <span>{showLogs ? "Hide Logs" : "Show Logs"}</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] font-mono font-semibold">
                {logs.length}
              </span>
            )}
          </button>
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Center Graph Canvas */}
      <div className="flex-1 min-w-0 relative h-full w-full">
        {/* Floating input trigger — mobile only with ample padding and min-width */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 lg:hidden">
          <button
            onClick={() => setMobileInputOpen(true)}
            className="px-5 py-2.5 rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] font-bold text-sm hover:opacity-90 transition-all cursor-pointer shadow-lg flex items-center gap-2 whitespace-nowrap min-w-[110px] justify-center"
            aria-label="Open input panel"
          >
            <span className="material-symbols-outlined text-lg leading-none">keyboard_arrow_down</span>
            <span>Input</span>
          </button>
        </div>

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
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-[var(--md-sys-color-primary-container)] flex items-center justify-center text-[var(--md-sys-color-on-primary-container)] mb-1">
                    <span className="material-symbols-outlined text-3xl leading-none">psychology</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                    No analysis yet
                  </h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-xs leading-relaxed">
                    Enter your argument text and API key on the left, then click
                    "Analyze Argument" to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Detail Sidebar */}
      {selectedStatement && displayResult && (
        <DetailSidebar
          statement={selectedStatement}
          result={displayResult}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      {/* Error notification floating toast */}
      {status === "error" && (
        <div className="fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-[360px] z-50 p-4 rounded-xl bg-[var(--md-sys-color-error-container)] border border-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error-container)] shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-1 font-bold text-sm text-[var(--md-sys-color-error)]">
            <span className="material-symbols-outlined text-lg leading-none">error</span>
            Error
          </div>
          <p className="text-xs leading-relaxed">
            {errorMessage}
          </p>
          <button
            onClick={() => setStatus("idle")}
            className="mt-3 text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Floating Debug Log Console */}
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
