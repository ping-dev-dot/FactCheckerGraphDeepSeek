import { useState, useCallback, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Sun, Moon, ChevronDown, X, Network, Terminal } from "lucide-react";
import { InputPanel } from "./components/InputPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { PipelineProgress } from "./components/PipelineProgress";
import { DebugLogConsole } from "./components/DebugLogConsole";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { generateId } from "../shared/id-generator";
import type {
  AnalysisResult,
  AppStatus,
  LogEntry,
  PartialAnalysisResult,
  PipelineProgress as PipelineProgressType,
  Statement,
  ThemeMode,
} from "../shared/types";

export default function App() {
  const [themeMode, setThemeMode] = useLocalStorage<ThemeMode>("theme-mode", "dark");

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

  const [mobileInputOpen, setMobileInputOpen] = useState(false);

  const isLight = themeMode === "light";

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const displayResult: AnalysisResult | PartialAnalysisResult | null =
    result ?? partialResult;

  const selectedStatement: Statement | null =
    selectedNodeId && displayResult?.statements
      ? displayResult.statements.find((s) => s.id === selectedNodeId) ?? null
      : null;

  const isRunning = status === "running" || status === "partial";

  // ── Submit: POST /api/analyze, then listen via SSE ──
  const handleSubmit = useCallback(async () => {
    setMobileInputOpen(false);
    setStatus("running");
    setErrorMessage("");
    setResult(null);
    setPartialResult(null);
    setSelectedNodeId(null);
    setPipelineProgress({ stage: "preprocessing", message: "Starting pipeline...", statementsFound: 0, totalSteps: 3, currentStep: 0 });

    try {
      // Create analysis
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start analysis");
      }

      const { analysisId } = await res.json();
      addLog({
        id: generateId(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Analysis created: ${analysisId}`,
      });

      // Listen to SSE stream
      const eventSource = new EventSource(`/api/analyze/${analysisId}/stream`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "step:start":
              setPipelineProgress({
                stage: data.step === 0 ? "preprocessing"
                  : data.step === 1 ? "extracting"
                  : data.step === 2 ? "analyzing_relations"
                  : "scoring",
                message: data.message,
                statementsFound: data.statements?.length ?? 0,
                totalSteps: 4,
                currentStep: data.step,
              });
              break;

            case "step:complete":
              if (data.step === 1 && data.statements) {
                setPartialResult((prev) => ({ ...prev, statements: data.statements }));
                setStatus("partial");
              }
              if (data.step === 2) {
                setPartialResult((prev) => ({
                  ...prev,
                  relations: data.relations,
                  fallacies: data.fallacies,
                  cycles: data.cycles,
                }));
              }
              if (data.step === 3 && data.statements) {
                setPartialResult((prev) => ({ ...prev, statements: data.statements }));
              }
              break;

            case "statements:update":
              if (data.statements) {
                setPartialResult((prev) => ({ ...prev, statements: data.statements }));
                setStatus("partial");
                setPipelineProgress((prev) => prev ? {
                  ...prev,
                  statementsFound: data.statements.length,
                } : prev);
              }
              break;

            case "pipeline:complete":
              if (data.result) {
                setResult(data.result);
                setStatus("success");
                setPipelineProgress((prev) => prev ? { ...prev, stage: "complete" } : prev);
              }
              eventSource.close();
              break;

            case "step:error":
              setErrorMessage(data.message);
              break;

            case "error":
              setErrorMessage(data.message);
              if (data.partial) setStatus("partial");
              else setStatus("error");
              eventSource.close();
              break;
          }
        } catch {
          // Skip unparseable events
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (status !== "success") {
          setErrorMessage("Connection lost. The analysis may still be running.");
          if (partialResult?.statements?.length) setStatus("partial");
          else setStatus("error");
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setErrorMessage(message);
      setStatus("error");
    }
  }, [inputText, partialResult, status, addLog]);

  const handleViewPartial = useCallback(() => {
    setErrorMessage("");
    setStatus("partial");
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setMobileInputOpen(false);
  }, []);

  return (
    <div className={`h-screen w-screen flex flex-col lg:flex-row overflow-hidden relative font-sans transition-colors ${
      isLight ? "bg-[#f8f9fa] text-[#18181b]" : "bg-[#09090b] text-[#f4f4f5]"
    }`}>
      {/* Mobile Header */}
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

        <div className="w-8" />
      </div>

      {/* Mobile Input Drawer */}
      {mobileInputOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileInputOpen(false)} />
          <div className={`fixed top-0 left-0 right-0 z-[45] max-h-[60vh] border-b rounded-b-md shadow-xl overflow-y-auto animate-slide-down lg:hidden ${
            isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
          }`}>
            <InputPanel
              inputText={inputText}
              onInputTextChange={setInputText}
              selectedPreset={selectedPreset}
              onPresetSelect={setSelectedPreset}
              onSubmit={handleSubmit}
              isLoading={isRunning}
              pipelineProgress={pipelineProgress}
              variant="mobile-input"
              themeMode={themeMode}
              onThemeModeChange={setThemeMode}
              onClose={() => setMobileInputOpen(false)}
            />
          </div>
        </>
      )}

      {/* Desktop Left Panel */}
      <div className={`hidden lg:flex w-[350px] flex-shrink-0 border-r flex-col h-full overflow-hidden ${
        isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
      }`}>
        <InputPanel
          inputText={inputText}
          onInputTextChange={setInputText}
          selectedPreset={selectedPreset}
          onPresetSelect={setSelectedPreset}
          onSubmit={handleSubmit}
          isLoading={isRunning}
          pipelineProgress={pipelineProgress}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          variant="desktop"
        />

        {/* Debug Logs Footer */}
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
            <button onClick={clearLogs} className="text-[11px] text-[#71717a] hover:text-[#ef4444] transition-colors cursor-pointer font-medium">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Center — Graph Canvas */}
      <div className={`flex-1 min-w-0 relative h-full w-full ${
        isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"
      }`}>
        <button
          onClick={() => setMobileInputOpen(true)}
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 
                     rounded-full font-semibold text-xs
                     transition-colors cursor-pointer shadow-md
                     lg:hidden flex items-center gap-1.5 ${
                       isLight
                         ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                         : "bg-[#60a5fa] text-[#09090b] hover:bg-[#3b82f6]"
                     }`}
          aria-label="Open input panel"
        >
          <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Input</span>
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
                  errorMessage={status === "partial" && errorMessage ? errorMessage : undefined}
                  isPartial={status === "partial" && !!partialResult?.statements?.length}
                  onViewPartial={status === "partial" && errorMessage && partialResult?.statements?.length ? handleViewPartial : undefined}
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
                    Enter argument text and click Analyze to map logical structure.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right — Detail Sidebar */}
      {selectedStatement && displayResult && (
        <DetailSidebar
          statement={selectedStatement}
          result={displayResult}
          onClose={() => setSelectedNodeId(null)}
          themeMode={themeMode}
        />
      )}

      {/* Error notification */}
      {status === "error" && (
        <div className={`fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-[360px] z-50 p-3 rounded-md border shadow-lg ${
          isLight ? "bg-[#ffffff] border-[#ef4444]/40" : "bg-[#161618] border-[#ef4444]/40"
        }`}>
          <p className="text-xs text-[#ef4444] font-medium mb-1 uppercase tracking-wider">Analysis Failed</p>
          <p className={`text-xs leading-relaxed ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
            {errorMessage}
          </p>
          <button onClick={() => setStatus("idle")} className="mt-2 text-xs text-[#2563eb] hover:underline cursor-pointer font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* Debug Log Console */}
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
