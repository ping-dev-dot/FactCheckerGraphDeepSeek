import { useState, useEffect, useRef } from "react";
import type { LogEntry } from "../types";

interface DebugLogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
  onClose: () => void;
}

export function DebugLogConsole({ logs, onClear, onClose }: DebugLogConsoleProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        return "bg-[#89b4fa]/20 text-[#89b4fa] border-[#89b4fa]/40";
      case "debug":
        return "bg-[#a6adc8]/20 text-[#a6adc8] border-[#a6adc8]/40";
      case "warn":
        return "bg-[#f9e2af]/20 text-[#f9e2af] border-[#f9e2af]/40";
      case "error":
        return "bg-[#f38ba8]/20 text-[#f38ba8] border-[#f38ba8]/40";
    }
  };

  return (
    <div className="fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:bottom-4 z-50 w-auto sm:w-[560px] max-h-[60vh] sm:max-h-[400px] bg-[#181825] border border-[#313244] rounded-xl shadow-2xl flex flex-col overflow-hidden font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1e1e2e] border-b border-[#313244] select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#89b4fa] animate-pulse" />
          <span className="font-semibold text-[#cdd6f4]">
            Detailed Debug Logs ({logs.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-[#a6adc8] cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-[#89b4fa] rounded cursor-pointer"
            />
            Auto-scroll
          </label>
          <button
            onClick={handleCopy}
            disabled={logs.length === 0}
            className="px-2 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            title="Copy logs to clipboard"
          >
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="px-2 py-0.5 rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            title="Clear logs"
          >
            🗑 Clear
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[#a6adc8] hover:text-[#cdd6f4] transition-colors cursor-pointer"
            title="Close log viewer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Log items container */}
      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto space-y-1.5 bg-[#11111b] min-h-[160px] max-h-[320px]"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#585b70] italic py-8">
            No logs recorded yet. Start an analysis to see detailed stream logs.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex flex-col gap-0.5 p-1.5 rounded bg-[#1e1e2e]/60 hover:bg-[#1e1e2e] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#585b70] text-[10px] select-none">
                  {log.timestamp}
                </span>
                <span
                  className={`px-1 py-0.2 rounded text-[9px] font-bold border uppercase ${getLevelStyle(
                    log.level
                  )}`}
                >
                  {log.level}
                </span>
                <span className="text-[#cdd6f4] font-medium break-all">
                  {log.message}
                </span>
              </div>
              {log.details && (
                <div className="pl-14 text-[#a6adc8] text-[10px] break-all leading-relaxed whitespace-pre-wrap">
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
