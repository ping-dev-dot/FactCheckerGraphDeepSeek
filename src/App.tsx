import { useState, useCallback, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { InputPanel } from "./components/InputPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { PipelineProgress } from "./components/PipelineProgress";
import { runAnalysisPipeline, PipelineStepError } from "./api";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type {
  AnalysisResult,
  AppStatus,
  PartialAnalysisResult,
  PipelineProgress as PipelineProgressType,
  Statement,
  FactCheckProgress,
  FactCheckSourceEval,
  FactCheckVerdict,
} from "./types";

export default function App() {
  const [apiKey, setApiKey] = useLocalStorage<string>("deepseek-api-key", "");
  const [braveApiKey, setBraveApiKey] = useLocalStorage<string>("brave-api-key", "");
  const [inputText, setInputText] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [partialResult, setPartialResult] = useState<PartialAnalysisResult | null>(null);
  const [pipelineProgress, setPipelineProgress] =
    useState<PipelineProgressType | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [factCheckProgress, setFactCheckProgress] = useState<Record<string, FactCheckProgress>>({});
  // Separate fact-check data to avoid reference/merge issues
  const [factCheckSources, setFactCheckSources] = useState<Record<string, FactCheckSourceEval[]>>({});
  const [factCheckVerdicts, setFactCheckVerdicts] = useState<Record<string, FactCheckVerdict | null>>({});

  // Cache for retry: keep text/apiKey and step 1 results across retries
  const retryCache = useRef<{
    text: string;
    apiKey: string;
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
    setStatus("running");
    setErrorMessage("");
    setResult(null);
    setPartialResult(null);
    setSelectedNodeId(null);
    setPipelineProgress({ stage: "preprocessing", message: "Starting...", statementsFound: 0, totalSteps: 3, currentStep: 0 });

    retryCache.current = { text: inputText, apiKey };

    try {
      const finalResult = await runAnalysisPipeline(
        inputText,
        apiKey,
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
        // braveApiKey
        braveApiKey || undefined,
        // onFactCheckProgress
        (progress) => {
          setFactCheckProgress((prev) => ({
            ...prev,
            [progress.statementId]: progress,
          }));
        },
        // onStatementFactChecked
        (statementId, sources, verdict) => {
          // Update separate fact-check state (avoids merge issues)
          setFactCheckSources((prev) => ({ ...prev, [statementId]: sources }));
          setFactCheckVerdicts((prev) => ({ ...prev, [statementId]: verdict }));
          // Also update the main result for consistency
          setResult((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              statements: prev.statements.map((s) =>
                s.id === statementId
                  ? { ...s, factCheckSources: sources, factCheckResult: verdict ?? undefined }
                  : s
              ),
            };
          });
          setPartialResult((prev) => {
            if (!prev?.statements) return prev;
            return {
              ...prev,
              statements: prev.statements.map((s) =>
                s.id === statementId
                  ? { ...s, factCheckSources: sources, factCheckResult: verdict ?? undefined }
                  : s
              ),
            };
          });
        }
      );
      setResult(finalResult);
      setStatus("success");
      setPipelineProgress({
        stage: "complete",
        message: `Analysis complete: ${finalResult.statements.length} statements`,
        statementsFound: finalResult.statements.length,
        totalSteps: 3,
        currentStep: 3,
      });
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
  }, [inputText, apiKey, partialResult]);

  // Retry from step 2 (cached step 1 results)
  const handleRetry = useCallback(async () => {
    const cache = retryCache.current;
    if (!cache?.statements?.length || !cache.apiKey) return;

    setStatus("running");
    setErrorMessage("");
    setPipelineProgress({ stage: "analyzing_relations", message: "Retrying relation analysis...", statementsFound: cache.statements.length, totalSteps: 3, currentStep: 2 });

    try {
      const finalResult = await runAnalysisPipeline(
        cache.text,
        cache.apiKey,
        (progress) => setPipelineProgress(progress),
        (statements) => {
          setPartialResult((prev) => ({ ...prev, statements }));
        },
        (partial) => {
          setPartialResult(partial);
          setStatus("partial");
        },
        braveApiKey || undefined,
        (progress) => {
          setFactCheckProgress((prev) => ({ ...prev, [progress.statementId]: progress }));
        },
        (statementId, sources, verdict) => {
          const updateStmt = (s: Statement) => {
            if (s.id === statementId) {
              (s as any).factCheckSources = sources;
              (s as any).factCheckResult = verdict ?? undefined;
            }
            return s;
          };
          setResult((prev) => {
            if (!prev) return prev;
            return { ...prev, statements: prev.statements.map(updateStmt) };
          });
          setPartialResult((prev) => {
            if (!prev?.statements) return prev;
            return { ...prev, statements: prev.statements.map(updateStmt) };
          });
        }
      );
      setResult(finalResult);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setErrorMessage(message);
      setStatus("partial");
    }
  }, []);

  // View partial results only (dismiss error, show statements)
  const handleViewPartial = useCallback(() => {
    setErrorMessage("");
    setStatus("partial");
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const isRunning = status === "running" || status === "partial";

  return (
    <div className="h-screen w-screen flex flex-col lg:flex-row bg-[#11111b] overflow-hidden">
      {/* Left panel — input (full width on mobile, fixed on desktop) */}
      <div className="w-full lg:w-[360px] lg:flex-shrink-0 border-b lg:border-b-0 lg:border-r border-[#313244] bg-[#1e1e2e] flex flex-col max-h-[45vh] lg:max-h-none lg:h-full">
        <InputPanel
          inputText={inputText}
          onInputTextChange={setInputText}
          selectedPreset={selectedPreset}
          onPresetSelect={setSelectedPreset}
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          braveApiKey={braveApiKey}
          onBraveApiKeyChange={setBraveApiKey}
          onSubmit={handleSubmit}
          isLoading={isRunning}
        />

        {/* Error notification */}
        {status === "error" && (
          <div className="mx-4 mb-4 p-3 rounded-lg bg-[#f38ba8]/10 border border-[#f38ba8]/30">
            <p className="text-xs text-[#f38ba8] font-semibold mb-1">Error</p>
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

      {/* Center — graph (flex-1 on mobile and desktop) */}
      <div className="flex-1 min-w-0 relative min-h-[45vh] lg:min-h-0">
        {displayResult && displayResult.statements && displayResult.statements.length > 0 ? (
          <ReactFlowProvider>
            <GraphCanvas
              result={displayResult}
              factCheckVerdicts={factCheckVerdicts}
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

      {/* Right — detail sidebar (overlay on mobile, fixed on desktop) */}
      {selectedStatement && displayResult && (
        <DetailSidebar
          key={selectedNodeId}
          statement={selectedStatement}
          result={displayResult}
          onClose={() => setSelectedNodeId(null)}
          factCheckProgress={selectedNodeId ? factCheckProgress[selectedNodeId] ?? null : null}
          factCheckSources={selectedNodeId ? factCheckSources[selectedNodeId] ?? [] : []}
          factCheckVerdict={selectedNodeId ? factCheckVerdicts[selectedNodeId] ?? null : null}
          braveKeyPresent={!!braveApiKey.trim()}
        />
      )}
    </div>
  );
}
