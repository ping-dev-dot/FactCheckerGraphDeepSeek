import { useState, useCallback, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Sun, Moon, ChevronDown, Network, Terminal } from "lucide-react";
import { InputPanel } from "./components/InputPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { DetailSidebar } from "./components/DetailSidebar";
import { PipelineProgress } from "./components/PipelineProgress";
import { DebugLogConsole } from "./components/DebugLogConsole";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { generateId } from "../shared/id-generator";
import { supabase } from "./lib/supabase";
import type {
  AnalysisResult,
  AppStatus,
  LogEntry,
  PartialAnalysisResult,
  PipelineProgress as PipelineProgressType,
  Statement,
  Relation,
  ThemeMode,
  QueryItem,
  QueryResultItem,
  FactCheckSource,
} from "../shared/types";
import { DEFAULT_MODEL } from "../shared/types";

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
  const [selectedRelation, setSelectedRelation] = useState<Relation | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [mobileInputOpen, setMobileInputOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useLocalStorage<string>("selected-model", DEFAULT_MODEL);

  const isLight = themeMode === "light";
  const relDebounceTimer = useRef<any>(null);

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

  // ── Submit: Create Session & Subscribe to Realtime (Database Entry Driven Pipeline) ──
  const handleSubmit = useCallback(async () => {
    setMobileInputOpen(false);
    setStatus("running");
    setErrorMessage("");
    setResult(null);
    setPartialResult({
      statements: [],
      relations: [],
      fallacies: [],
      queries: [],
      queryResults: [],
      factCheckSources: [],
    });
    setSelectedNodeId(null);
    setSelectedRelation(null);
    setPipelineProgress({
      stage: "preprocessing",
      message: "Erstelle Sitzung in Supabase...",
      statementsFound: 0,
      totalSteps: 5,
      currentStep: 0,
    });

    try {
      // 1. Create session in Supabase PostgreSQL
      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({
          raw_text: inputText,
          provider: "openrouter",
          model: selectedModel,
          status: "processing",
        })
        .select()
        .single();

      if (sessionErr || !session) {
        throw new Error(sessionErr?.message || "Failed to create session in Supabase");
      }

      const sessionId = session.id;
      addLog({
        id: generateId(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Supabase Session created: ${sessionId} (Model: ${selectedModel})`,
      });

      // Track triggered functions to prevent duplicate invocations
      const triggeredFunctions = new Set<string>();

      // 2. Subscribe to Supabase Realtime Postgres Changes & Database Entry Triggers
      supabase
        .channel(`session-${sessionId}`)
        // Statements
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "statements", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const newRow = payload.new as any;
            const newStmt: Statement = {
              id: newRow.id,
              text: newRow.inhalt,
              speakerId: newRow.speaker_id,
              factCheckDifficulty: typeof newRow.difficulty_score === "number" ? newRow.difficulty_score : 50,
              factCheckExplanation: newRow.difficulty_explanation,
              typ: newRow.typ,
            };

            setPartialResult((prev) => {
              const existing = prev?.statements || [];
              if (existing.some((s) => s.id === newStmt.id)) return prev;
              const updatedStmts = [...existing, newStmt];
              return {
                statements: updatedStmts,
                relations: prev?.relations || [],
                fallacies: prev?.fallacies || [],
                queries: prev?.queries || [],
                queryResults: prev?.queryResults || [],
                factCheckSources: prev?.factCheckSources || [],
              };
            });

            setStatus("partial");
            setPipelineProgress((prev) =>
              prev
                ? {
                    ...prev,
                    stage: "extracting",
                    statementsFound: (prev.statementsFound || 0) + 1,
                    message: `${(prev.statementsFound || 0) + 1} Aussagen extrahiert...`,
                  }
                : prev
            );
            addLog({
              id: generateId(),
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Realtime Statement Added: [${newRow.typ || "faktisch"}] ${newRow.inhalt.slice(0, 40)}...`,
            });

            // Database Entry Trigger: query-generieren for factual claim
            if (newRow.typ === "faktisch" && !triggeredFunctions.has(`query-gen-${newRow.id}`)) {
              triggeredFunctions.add(`query-gen-${newRow.id}`);
              addLog({
                id: generateId(),
                timestamp: new Date().toISOString(),
                level: "info",
                message: `[Database Entry Trigger] Invoking query-generieren for statement ${newRow.id.slice(0, 8)}...`,
              });
              supabase.functions.invoke("query-generieren", {
                body: { statement_id: newRow.id, inhalt: newRow.inhalt, typ: newRow.typ, model: selectedModel },
              }).then(({ data, error }) => {
                if (error) {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "error",
                    message: `query-generieren failed for ${newRow.id.slice(0, 8)}: ${error.message}`,
                  });
                } else {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "info",
                    message: `query-generieren returned 200 OK (${data?.queries?.length || 0} queries generated)`,
                  });
                }
              }).catch((err) => {
                addLog({
                  id: generateId(),
                  timestamp: new Date().toISOString(),
                  level: "error",
                  message: `query-generieren exception: ${err instanceof Error ? err.message : String(err)}`,
                });
              });
            }

            // Database Entry Trigger: relationen-analysieren debounced when >= 2 statements exist
            if (relDebounceTimer.current) clearTimeout(relDebounceTimer.current);
            relDebounceTimer.current = setTimeout(() => {
              if (!triggeredFunctions.has(`rel-ana-${sessionId}`)) {
                triggeredFunctions.add(`rel-ana-${sessionId}`);
                addLog({
                  id: generateId(),
                  timestamp: new Date().toISOString(),
                  level: "info",
                  message: `[Database Entry Trigger] Invoking relationen-analysieren for session ${sessionId.slice(0, 8)}...`,
                });
                supabase.functions.invoke("relationen-analysieren", {
                  body: { session_id: sessionId, model: selectedModel },
                }).then(({ data, error }) => {
                  if (error) {
                    addLog({
                      id: generateId(),
                      timestamp: new Date().toISOString(),
                      level: "error",
                      message: `relationen-analysieren failed: ${error.message}`,
                    });
                  } else {
                    addLog({
                      id: generateId(),
                      timestamp: new Date().toISOString(),
                      level: "info",
                      message: `relationen-analysieren returned 200 OK (${data?.relations?.length || 0} relations analyzed)`,
                    });
                  }
                }).catch((err) => {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "error",
                    message: `relationen-analysieren exception: ${err instanceof Error ? err.message : String(err)}`,
                  });
                });
              }
            }, 1200);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "statements", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const updatedRow = payload.new as any;
            setPartialResult((prev) => {
              if (!prev?.statements) return prev;
              const updated = prev.statements.map((s) => {
                if (s.id === updatedRow.id) {
                  return {
                    ...s,
                    finalVerdict: updatedRow.final_verdict,
                    finalEvaluation: updatedRow.final_evaluation,
                  };
                }
                return s;
              });
              return {
                statements: updated,
                relations: prev.relations || [],
                fallacies: prev.fallacies || [],
                queries: prev.queries || [],
                queryResults: prev.queryResults || [],
                factCheckSources: prev.factCheckSources || [],
              };
            });
          }
        )
        // Relations
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "relations", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const rel = payload.new as any;
            const newRelation: Relation = {
              from: rel.from_statement_id || rel.from,
              to: rel.to_statement_id || rel.to,
              type: rel.type || rel.typ || "implication",
              label: rel.label,
              details: rel.reasoning || rel.details,
            };
            setPartialResult((prev) => {
              const existing = prev?.relations || [];
              if (existing.some((r) => r.from === newRelation.from && r.to === newRelation.to && r.type === newRelation.type)) return prev;
              return {
                statements: prev?.statements || [],
                relations: [...existing, newRelation],
                fallacies: prev?.fallacies || [],
                queries: prev?.queries || [],
                queryResults: prev?.queryResults || [],
                factCheckSources: prev?.factCheckSources || [],
              };
            });
            setPipelineProgress((prev) =>
              prev
                ? {
                    ...prev,
                    stage: "analyzing_relations",
                    message: "Analysiere Beziehungsnetzwerk & Logik...",
                  }
                : prev
            );
            addLog({
              id: generateId(),
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Realtime Relation Added: ${newRelation.from.slice(0, 8)} -> ${newRelation.to.slice(0, 8)} (${newRelation.type})`,
            });
          }
        )
        // Fallacies
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "fallacies", filter: `session_id=eq.${sessionId}` },
          (payload) => {
            const fal = payload.new as any;
            const newFallacy = {
              statementId: fal.statement_id,
              fallacyType: fal.fallacy_type,
              description: fal.reasoning,
            };
            setPartialResult((prev) => {
              const existing = prev?.fallacies || [];
              if (existing.some((f) => f.statementId === newFallacy.statementId && f.fallacyType === newFallacy.fallacyType)) return prev;
              return {
                statements: prev?.statements || [],
                relations: prev?.relations || [],
                fallacies: [...existing, newFallacy],
                queries: prev?.queries || [],
                queryResults: prev?.queryResults || [],
                factCheckSources: prev?.factCheckSources || [],
              };
            });
            addLog({
              id: generateId(),
              timestamp: new Date().toISOString(),
              level: "warn",
              message: `Realtime Fallacy Detected: [${fal.fallacy_type}] for statement ${fal.statement_id.slice(0, 8)}`,
            });
          }
        )
        // Queries
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "queries" },
          (payload) => {
            const q = payload.new as any;
            const newQuery: QueryItem = {
              id: q.id,
              statementId: q.statement_id,
              text: q.inhalt,
              createdAt: q.created_at,
            };
            setPartialResult((prev) => {
              const existing = prev?.queries || [];
              if (existing.some((item) => item.id === newQuery.id)) return prev;
              return {
                statements: prev?.statements || [],
                relations: prev?.relations || [],
                fallacies: prev?.fallacies || [],
                queries: [...existing, newQuery],
                queryResults: prev?.queryResults || [],
                factCheckSources: prev?.factCheckSources || [],
              };
            });
            addLog({
              id: generateId(),
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Realtime Query Generated: "${q.inhalt}"`,
            });

            // Database Entry Trigger: query-ausfuehren
            if (!triggeredFunctions.has(`query-exec-${q.id}`)) {
              triggeredFunctions.add(`query-exec-${q.id}`);
              addLog({
                id: generateId(),
                timestamp: new Date().toISOString(),
                level: "info",
                message: `[Database Entry Trigger] Invoking query-ausfuehren for query ${q.id.slice(0, 8)}...`,
              });
              supabase.functions.invoke("query-ausfuehren", {
                body: { query_id: q.id, statement_id: q.statement_id, inhalt: q.inhalt },
              }).then(({ data, error }) => {
                if (error) {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "error",
                    message: `query-ausfuehren failed for ${q.id.slice(0, 8)}: ${error.message}`,
                  });
                } else {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "info",
                    message: `query-ausfuehren returned 200 OK (${data?.saved_results || 0} search results found)`,
                  });
                }
              }).catch((err) => {
                addLog({
                  id: generateId(),
                  timestamp: new Date().toISOString(),
                  level: "error",
                  message: `query-ausfuehren exception: ${err instanceof Error ? err.message : String(err)}`,
                });
              });
            }
          }
        )
        // Query Results
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "query_results" },
          (payload) => {
            const qr = payload.new as any;
            const newQR: QueryResultItem = {
              id: qr.id,
              queryId: qr.query_id,
              statementId: qr.statement_id,
              url: qr.url,
              title: qr.title,
              snippets: qr.snippets,
              createdAt: qr.created_at,
            };
            setPartialResult((prev) => {
              const existing = prev?.queryResults || [];
              if (existing.some((item) => item.id === newQR.id)) return prev;
              return {
                statements: prev?.statements || [],
                relations: prev?.relations || [],
                fallacies: prev?.fallacies || [],
                queries: prev?.queries || [],
                queryResults: [...existing, newQR],
                factCheckSources: prev?.factCheckSources || [],
              };
            });
            addLog({
              id: generateId(),
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Realtime Web Result Found: ${qr.title || qr.url}`,
            });

            // Database Entry Trigger: quelle-bewerten
            if (!triggeredFunctions.has(`src-eval-${qr.id}`)) {
              triggeredFunctions.add(`src-eval-${qr.id}`);
              addLog({
                id: generateId(),
                timestamp: new Date().toISOString(),
                level: "info",
                message: `[Database Entry Trigger] Invoking quelle-bewerten for source ${qr.id.slice(0, 8)}...`,
              });
              supabase.functions.invoke("quelle-bewerten", {
                body: {
                  query_result_id: qr.id,
                  statement_id: qr.statement_id,
                  url: qr.url,
                  title: qr.title,
                  snippets: qr.snippets,
                  model: selectedModel,
                },
              }).then(({ data, error }) => {
                if (error) {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "error",
                    message: `quelle-bewerten failed for ${qr.id.slice(0, 8)}: ${error.message}`,
                  });
                } else {
                  addLog({
                    id: generateId(),
                    timestamp: new Date().toISOString(),
                    level: "info",
                    message: `quelle-bewerten returned 200 OK ([${data?.saved_bewertung?.urteil || "evaluated"}] source evaluated)`,
                  });
                }
              }).catch((err) => {
                addLog({
                  id: generateId(),
                  timestamp: new Date().toISOString(),
                  level: "error",
                  message: `quelle-bewerten exception: ${err instanceof Error ? err.message : String(err)}`,
                });
              });
            }
          }
        )
        // Fact Check Sources / Evaluations
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "fact_check_sources" },
          (payload) => {
            const src = payload.new as any;
            const newSrc: FactCheckSource = {
              id: src.id,
              statementId: src.statement_id,
              queryResultId: src.query_result_id,
              urteil: src.urteil,
              konfidenz: src.konfidenz,
              begruendung: src.begruendung,
            };
            setPartialResult((prev) => {
              const existing = prev?.factCheckSources || [];
              if (existing.some((item) => item.id === newSrc.id)) return prev;
              return {
                statements: prev?.statements || [],
                relations: prev?.relations || [],
                fallacies: prev?.fallacies || [],
                queries: prev?.queries || [],
                queryResults: prev?.queryResults || [],
                factCheckSources: [...existing, newSrc],
              };
            });
            setPipelineProgress((prev) =>
              prev
                ? {
                    ...prev,
                    stage: "scoring",
                    message: "Faktencheck & Quellen-Evaluierung...",
                  }
                : prev
            );
            addLog({
              id: generateId(),
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Realtime Source Evaluated: [${src.urteil}] ${src.begruendung?.slice(0, 50)}...`,
            });
          }
        )
        // Session Status
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
          (payload) => {
            const updatedSession = payload.new as any;
            if (updatedSession.status === "completed") {
              setStatus("success");
              setPipelineProgress((prev) => (prev ? { ...prev, stage: "complete", message: "Analyse abgeschlossen!" } : prev));
              addLog({
                id: generateId(),
                timestamp: new Date().toISOString(),
                level: "info",
                message: `Session Analysis Completed! Final Verdict: ${updatedSession.bewertung_urteil || "Done"}`,
              });
            }
          }
        )
        .subscribe();

      // 3. Trigger 1st Edge Function: behauptungen-generieren
      setPipelineProgress({
        stage: "extracting",
        message: "Extracting atomic claims (behauptungen-generieren)...",
        statementsFound: 0,
        totalSteps: 5,
        currentStep: 1,
      });

      addLog({
        id: generateId(),
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Invoking 1st Edge Function: behauptungen-generieren...`,
      });

      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke(
        "behauptungen-generieren",
        {
          body: { session_id: sessionId, inhalt: inputText, model: selectedModel },
        }
      );

      if (edgeErr) {
        const errMsg = `Edge function 'behauptungen-generieren' failed: ${edgeErr.message || JSON.stringify(edgeErr)}`;
        addLog({
          id: generateId(),
          timestamp: new Date().toISOString(),
          level: "error",
          message: errMsg,
        });
        setErrorMessage(`Edge Function Error: ${edgeErr.message || "Function not deployed or not reachable."}`);
        setStatus("error");
      } else {
        addLog({
          id: generateId(),
          timestamp: new Date().toISOString(),
          level: "info",
          message: `behauptungen-generieren returned 200 OK (${edgeData?.saved_claims || 0} claims saved)`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred";
      setErrorMessage(message);
      setStatus("error");
    }
  }, [inputText, selectedModel, addLog]);

  const handleViewPartial = useCallback(() => {
    setErrorMessage("");
    setStatus("partial");
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    setSelectedRelation(null);
  }, []);

  const handleEdgeSelect = useCallback((relation: Relation) => {
    setSelectedRelation(relation);
    setSelectedNodeId(null);
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedRelation(null);
    setMobileInputOpen(false);
  }, []);

  return (
    <div
      className={`h-screen w-screen flex flex-col lg:flex-row overflow-hidden relative font-sans transition-colors ${
        isLight ? "bg-[#f8f9fa] text-[#18181b]" : "bg-[#09090b] text-[#f4f4f5]"
      }`}
    >
      {/* Mobile Header */}
      <div
        className={`lg:hidden flex items-center justify-between px-3 py-2 border-b z-30 flex-shrink-0 gap-2 ${
          isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
        }`}
      >
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
          <span
            className={`text-xs font-semibold tracking-tight uppercase ${
              isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
            }`}
          >
            Supabase Argument Graph
          </span>
          {pipelineProgress && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded flex-shrink-0 ${
                isLight ? "bg-[#f4f4f5] text-[#71717a]" : "bg-[#27272a] text-[#a1a1aa]"
              }`}
            >
              {pipelineProgress.stage}
            </span>
          )}
        </div>

        <div className="w-8" />
      </div>

      {/* Mobile Input Drawer */}
      {mobileInputOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileInputOpen(false)}
          />
          <div
            className={`fixed top-0 left-0 right-0 z-[45] max-h-[60vh] border-b rounded-b-md shadow-xl overflow-y-auto animate-slide-down lg:hidden ${
              isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
            }`}
          >
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
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </div>
        </>
      )}

      {/* Desktop Left Panel */}
      <div
        className={`hidden lg:flex w-[350px] flex-shrink-0 border-r flex-col h-full overflow-hidden ${
          isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
        }`}
      >
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
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />

        {/* Debug Logs Footer */}
        <div
          className={`px-4 pb-3 pt-2 flex items-center justify-between border-t ${
            isLight ? "border-[#e4e4e7] bg-[#ffffff]" : "border-[#3f3f46] bg-[#18181b]"
          }`}
        >
          <button
            onClick={() => setShowLogs((prev) => !prev)}
            className={`text-xs transition-colors flex items-center gap-1.5 cursor-pointer font-medium ${
              isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{showLogs ? "Hide Logs" : "Show Logs"}</span>
            {logs.length > 0 && (
              <span
                className={`px-1.5 py-0.2 text-[10px] rounded font-mono ${
                  isLight ? "bg-[#f4f4f5] text-[#71717a]" : "bg-[#27272a] text-[#a1a1aa]"
                }`}
              >
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

      {/* Center — Graph Canvas */}
      <div
        className={`flex-1 min-w-0 relative h-full w-full ${
          isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"
        }`}
      >
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
              onEdgeSelect={handleEdgeSelect}
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
                  <div
                    className={`w-9 h-9 rounded-full border flex items-center justify-center mb-1 ${
                      isLight
                        ? "border-[#e4e4e7] bg-[#ffffff] text-[#71717a]"
                        : "border-[#3f3f46] bg-[#18181b] text-[#a1a1aa]"
                    }`}
                  >
                    <Network className="w-4 h-4" />
                  </div>
                  <p
                    className={`text-sm font-medium tracking-tight ${
                      isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
                    }`}
                  >
                    No Argument Analyzed
                  </p>
                  <p
                    className={`text-xs leading-relaxed ${
                      isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
                    }`}
                  >
                    Enter argument text and click Analyze to start Supabase Realtime pipeline.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right — Detail Sidebar */}
      {(selectedStatement || selectedRelation) && displayResult && (
        <DetailSidebar
          statement={selectedStatement}
          relation={selectedRelation}
          result={displayResult}
          onClose={() => {
            setSelectedNodeId(null);
            setSelectedRelation(null);
          }}
          onSelectNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            setSelectedRelation(null);
          }}
          themeMode={themeMode}
        />
      )}

      {/* Error notification */}
      {status === "error" && (
        <div
          className={`fixed bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-[360px] z-50 p-3 rounded-md border shadow-lg ${
            isLight ? "bg-[#ffffff] border-[#ef4444]/40" : "bg-[#161618] border-[#ef4444]/40"
          }`}
        >
          <p className="text-xs text-[#ef4444] font-medium mb-1 uppercase tracking-wider">
            Analysis Failed
          </p>
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
