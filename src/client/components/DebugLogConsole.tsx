import { useState, useEffect, useRef } from "react";
import { Terminal, Copy, Check, Trash2, X } from "lucide-react";
import type { LogEntry, ThemeMode } from "../../shared/types";

interface DebugLogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
  onClose: () => void;
  themeMode?: ThemeMode;
}

export function DebugLogConsole({ logs, onClear, onClose, themeMode = "dark" }: DebugLogConsoleProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLight = themeMode === "light";

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

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

  return (
    <div className={`fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:bottom-4 z-50 w-auto sm:w-[560px] max-h-[60vh] sm:max-h-[400px] border rounded-md shadow-lg flex flex-col overflow-hidden font-mono text-xs ${
      isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b select-none ${
        isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
      }`}>
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#3b82f6]" />
          <span className={`font-medium text-xs ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
            Debug Logs ({logs.length})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer ${
            isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
          }`}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-[#2563eb] rounded cursor-pointer"
            />
            Auto-scroll
          </label>
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

      {/* Log items container */}
      <div
        ref={scrollRef}
        className={`flex-1 p-3 overflow-y-auto space-y-1.5 min-h-[160px] max-h-[320px] ${
          isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"
        }`}
      >
        {logs.length === 0 ? (
          <div className={`h-full flex items-center justify-center py-8 text-xs font-sans ${
            isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
          }`}>
            No stream logs recorded. Start an analysis to view log events.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`flex flex-col gap-0.5 p-2 rounded border transition-colors ${
                isLight
                  ? "bg-[#ffffff] border-[#e4e4e7]"
                  : "bg-[#121215] border-[#3f3f46]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[#a1a1aa] text-[10px] select-none">
                  {log.timestamp}
                </span>
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
                <div className={`pl-14 text-[10px] break-all leading-relaxed whitespace-pre-wrap ${
                  isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
                }`}>
                  {log.details}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}




