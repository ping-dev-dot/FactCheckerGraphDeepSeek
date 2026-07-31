import { useState, useEffect, useRef } from "react";
import { Copy, Check, Trash2, X, Cpu, CheckCircle2, Loader2, AlertCircle, FileText, GitFork, Search, Globe, ShieldCheck, Award } from "lucide-react";
import type { LogEntry, ThemeMode } from "../../shared/types";

interface DebugLogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
  onClose: () => void;
  themeMode?: ThemeMode;
}

interface StepDetail {
  id: string;
  number: number;
  label: string;
  functionName: string;
  description: string;
  icon: any;
}

const PIPELINE_STEPS: StepDetail[] = [
  {
    id: "claims",
    number: 1,
    label: "Aussagen-Extraktion",
    functionName: "behauptungen-generieren",
    description: "Zerlegt Text in atomare, überprüfbare Faktenbehauptungen",
    icon: FileText,
  },
  {
    id: "relations",
    number: 2,
    label: "Beziehungsnetz & Logik",
    functionName: "relationen-analysieren",
    description: "Analysiert Implikationen, Kanten & Fehlschlüsse",
    icon: GitFork,
  },
  {
    id: "queries",
    number: 3,
    label: "Suchanfragen-Generierung",
    functionName: "query-generieren",
    description: "Formuliert 3 gezielte Suchanfragen pro Fakt",
    icon: Search,
  },
  {
    id: "search",
    number: 4,
    label: "Websuche & Quellen",
    functionName: "query-ausfuehren",
    description: "Führt Suchanfragen via Exa / Brave Search aus",
    icon: Globe,
  },
  {
    id: "evaluation",
    number: 5,
    label: "Quellen-Evaluierung",
    functionName: "quelle-bewerten",
    description: "Prüft Quellentexte auf Stützung oder Widerlegung",
    icon: ShieldCheck,
  },
  {
    id: "verdict",
    number: 6,
    label: "Fazit & Synthese",
    functionName: "satz-bewerten",
    description: "Erstellt das finale Urteil (Wahr / Falsch / Unbelegt)",
    icon: Award,
  },
];

export function DebugLogConsole({ logs, onClear, onClose, themeMode = "dark" }: DebugLogConsoleProps) {
  const [activeTab, setActiveTab] = useState<"flow" | "logs">("flow");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLight = themeMode === "light";

  useEffect(() => {
    if (autoScroll && scrollRef.current && activeTab === "logs") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, activeTab]);

  const handleCopy = async () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${
            l.details ? ` (${l.details})` : ""
          }`
      )
      .join("\n");

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const getLevelStyle = (level: LogEntry["level"]) => {
    switch (level) {
      case "info":
        return isLight
          ? "bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30"
          : "bg-[#60a5fa]/10 text-[#60a5fa] border-[#60a5fa]/30";
      case "debug":
        return isLight
          ? "bg-[#71717a]/10 text-[#71717a] border-[#71717a]/30"
          : "bg-[#a1a1aa]/10 text-[#a1a1aa] border-[#a1a1aa]/30";
      case "warn":
        return "bg-[#fbbf24]/10 text-[#d97706] border-[#fbbf24]/30";
      case "error":
        return "bg-[#ef4444]/10 text-[#dc2626] border-[#ef4444]/30";
    }
  };

  // Compute status & extracted count for each step from logs
  const getStepMetrics = (step: StepDetail) => {
    const isSessionComplete = logs.some(
      (l) =>
        l.message.toLowerCase().includes("session analysis completed") ||
        l.message.toLowerCase().includes("session analysis complete")
    );

    const fnLogs = logs.filter(
      (l) =>
        l.message.toLowerCase().includes(step.functionName.toLowerCase()) ||
        l.message.toLowerCase().includes(step.id.toLowerCase()) ||
        (l.details && l.details.toLowerCase().includes(step.functionName.toLowerCase())) ||
        (step.id === "claims" && (l.message.toLowerCase().includes("statement") || l.message.toLowerCase().includes("claim"))) ||
        (step.id === "relations" && (l.message.toLowerCase().includes("relation") || l.message.toLowerCase().includes("fallacy"))) ||
        (step.id === "queries" && l.message.toLowerCase().includes("query")) ||
        (step.id === "search" && (l.message.toLowerCase().includes("web result") || l.message.toLowerCase().includes("search"))) ||
        (step.id === "evaluation" && (l.message.toLowerCase().includes("source") || l.message.toLowerCase().includes("quelle"))) ||
        (step.id === "verdict" && (l.message.toLowerCase().includes("verdict") || l.message.toLowerCase().includes("session analysis")))
    );

    if (fnLogs.length === 0) {
      if (isSessionComplete) {
        return { status: "completed", count: 0, lastMsg: "Abgeschlossen" };
      }
      return { status: "idle", count: 0, lastMsg: "Wartet..." };
    }

    const hasError = fnLogs.some((l) => l.level === "error");
    if (hasError) return { status: "error", count: fnLogs.length, lastMsg: fnLogs[fnLogs.length - 1].message };

    const isComplete =
      isSessionComplete ||
      fnLogs.some(
        (l) =>
          l.message.toLowerCase().includes("completed") ||
          l.message.toLowerCase().includes("final verdict") ||
          l.message.toLowerCase().includes("evaluated") ||
          l.message.toLowerCase().includes("200 ok") ||
          l.message.toLowerCase().includes("returned") ||
          l.message.toLowerCase().includes("erfolgreich") ||
          l.message.toLowerCase().includes("abgeschlossen")
      );

    if (isComplete) return { status: "completed", count: fnLogs.length, lastMsg: fnLogs[fnLogs.length - 1].message };

    return { status: "running", count: fnLogs.length, lastMsg: fnLogs[fnLogs.length - 1].message };
  };

  return (
    <div
      className={`fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:bottom-4 z-50 w-auto sm:w-[640px] max-h-[70vh] sm:max-h-[480px] border rounded-md shadow-xl flex flex-col overflow-hidden font-mono text-xs ${
        isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
      }`}
    >
      {/* Header & Tabs */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b select-none flex-wrap gap-2 ${
          isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium text-xs">
            <Cpu className="w-4 h-4 text-[#3b82f6]" />
            <span className={isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}>Pipeline Flow & Logs</span>
          </div>

          <div
            className={`flex items-center rounded p-0.5 border ${
              isLight ? "bg-[#f4f4f5] border-[#e4e4e7]" : "bg-[#27272a] border-[#3f3f46]"
            }`}
          >
            <button
              onClick={() => setActiveTab("flow")}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === "flow"
                  ? isLight
                    ? "bg-[#ffffff] text-[#18181b] shadow-sm"
                    : "bg-[#18181b] text-[#f4f4f5] shadow-sm"
                  : isLight
                  ? "text-[#71717a] hover:text-[#18181b]"
                  : "text-[#a1a1aa] hover:text-[#f4f4f5]"
              }`}
            >
              Pipeline Stepper (6 Steps)
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === "logs"
                  ? isLight
                    ? "bg-[#ffffff] text-[#18181b] shadow-sm"
                    : "bg-[#18181b] text-[#f4f4f5] shadow-sm"
                  : isLight
                  ? "text-[#71717a] hover:text-[#18181b]"
                  : "text-[#a1a1aa] hover:text-[#f4f4f5]"
              }`}
            >
              Raw Logs ({logs.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "logs" && (
            <label
              className={`flex items-center gap-1.5 text-[11px] cursor-pointer ${
                isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
              }`}
            >
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-[#2563eb] rounded cursor-pointer"
              />
              Auto-scroll
            </label>
          )}
          <button
            onClick={handleCopy}
            disabled={logs.length === 0}
            className={`px-2 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed text-[11px] font-medium flex items-center gap-1 ${
              isLight ? "bg-[#f4f4f5] hover:bg-[#e4e4e7] text-[#18181b]" : "bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5]"
            }`}
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-[#22c55e]" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className={`px-2 py-1 rounded transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed text-[11px] font-medium flex items-center gap-1 ${
              isLight ? "bg-[#f4f4f5] hover:bg-[#e4e4e7] text-[#18181b]" : "bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5]"
            }`}
            title="Clear logs"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
          <button
            onClick={onClose}
            className={`p-1 transition-colors cursor-pointer text-sm ${
              isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
            title="Close log viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab 1: Pipeline Stepper Timeline Flow */}
      {activeTab === "flow" && (
        <div className={`p-4 overflow-y-auto space-y-3 flex-1 ${isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"}`}>
          <div className="flex flex-col gap-2.5 relative">
            {PIPELINE_STEPS.map((step) => {
              const metrics = getStepMetrics(step);
              const Icon = step.icon;

              return (
                <div
                  key={step.id}
                  className={`p-3 rounded-lg border flex items-start gap-3 transition-all relative ${
                    metrics.status === "completed"
                      ? isLight
                        ? "bg-[#ffffff] border-[#22c55e]/40 shadow-sm"
                        : "bg-[#18181b] border-[#22c55e]/40 shadow-sm"
                      : metrics.status === "running"
                      ? isLight
                        ? "bg-[#3b82f6]/5 border-[#3b82f6]/50 shadow-sm ring-1 ring-[#3b82f6]/30"
                        : "bg-[#3b82f6]/10 border-[#3b82f6]/50 shadow-sm ring-1 ring-[#3b82f6]/30"
                      : metrics.status === "error"
                      ? isLight
                        ? "bg-[#ef4444]/5 border-[#ef4444]/40"
                        : "bg-[#ef4444]/10 border-[#ef4444]/40"
                      : isLight
                      ? "bg-[#ffffff] border-[#e4e4e7] opacity-60"
                      : "bg-[#18181b] border-[#3f3f46] opacity-60"
                  }`}
                >
                  {/* Step number badge */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono border ${
                      metrics.status === "completed"
                        ? "bg-[#22c55e]/15 border-[#22c55e] text-[#22c55e]"
                        : metrics.status === "running"
                        ? "bg-[#3b82f6]/15 border-[#3b82f6] text-[#3b82f6] animate-pulse"
                        : metrics.status === "error"
                        ? "bg-[#ef4444]/15 border-[#ef4444] text-[#ef4444]"
                        : isLight
                        ? "bg-[#f4f4f5] border-[#e4e4e7] text-[#71717a]"
                        : "bg-[#27272a] border-[#3f3f46] text-[#a1a1aa]"
                    }`}
                  >
                    {metrics.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : metrics.status === "running" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : metrics.status === "error" ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <span>{step.number}</span>
                    )}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <Icon className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0" />
                        <span className={`font-semibold text-xs font-sans ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                          {step.label}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#71717a] flex-shrink-0">
                        {step.functionName}
                      </span>
                    </div>

                    <p className={`text-[11px] font-sans leading-relaxed ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
                      {step.description}
                    </p>

                    {metrics.lastMsg && metrics.status !== "idle" && (
                      <div className="mt-1.5 pt-1.5 border-t border-dashed border-[#3f3f46]/30 flex items-center justify-between text-[10px] font-mono">
                        <span className="truncate text-[#60a5fa]">
                          {metrics.lastMsg}
                        </span>
                        {metrics.count > 0 && (
                          <span className="flex-shrink-0 text-[#71717a] font-mono ml-2">
                            {metrics.count} Event{metrics.count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Raw Stream Logs */}
      {activeTab === "logs" && (
        <div
          ref={scrollRef}
          className={`flex-1 p-3 overflow-y-auto space-y-1.5 min-h-[180px] max-h-[320px] ${
            isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"
          }`}
        >
          {logs.length === 0 ? (
            <div
              className={`h-full flex items-center justify-center py-8 text-xs font-sans ${
                isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
              }`}
            >
              Keine Logs vorhanden. Starte eine Analyse, um Echtzeit-Events zu sehen.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`flex flex-col gap-0.5 p-2 rounded border transition-colors ${
                  isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#121215] border-[#3f3f46]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#a1a1aa] text-[10px] select-none">{log.timestamp}</span>
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-medium border uppercase tracking-wider ${getLevelStyle(
                      log.level
                    )}`}
                  >
                    {log.level}
                  </span>
                  <span className={`font-normal break-all ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                    {log.message}
                  </span>
                </div>
                {log.details && (
                  <div
                    className={`pl-14 text-[10px] break-all leading-relaxed whitespace-pre-wrap ${
                      isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
                    }`}
                  >
                    {log.details}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
