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
        return "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]";
      case "debug":
        return "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]";
      case "warn":
        return "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]";
      case "error":
        return "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]";
    }
  };

  return (
    <div className="fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:bottom-4 z-50 w-auto sm:w-[560px] max-h-[60vh] sm:max-h-[400px] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)] rounded-2xl shadow-2xl flex flex-col overflow-hidden font-mono text-xs">
      <md-elevation></md-elevation>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--md-sys-color-surface-container-high)] border-b border-[var(--md-sys-color-outline-variant)] select-none">
        <div className="flex items-center gap-2">
          <md-icon style={{ fontSize: '18px', color: "var(--md-sys-color-primary)" }}>terminal</md-icon>
          <span className="font-bold text-[var(--md-sys-color-on-surface)]">
            Detailed Debug Logs ({logs.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
              autoScroll ? "text-[var(--md-sys-color-primary)] font-semibold" : "text-[var(--md-sys-color-on-surface-variant)]"
            }`}
          >
            <md-icon style={{ fontSize: '14px' }}>{autoScroll ? "vertical_align_bottom" : "pause"}</md-icon>
            Auto-scroll
          </button>
          <md-text-button onClick={handleCopy} disabled={logs.length === 0}>
            {copied ? "Copied" : "Copy"}
          </md-text-button>
          <md-text-button onClick={onClear} disabled={logs.length === 0}>
            Clear
          </md-text-button>
          <md-icon-button onClick={onClose} aria-label="Close logs">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
      </div>

      {/* Log items container */}
      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto space-y-2 bg-[var(--md-sys-color-surface-container-lowest)] min-h-[160px] max-h-[320px]"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[var(--md-sys-color-outline)] italic py-8">
            No logs recorded yet. Start an analysis to see detailed stream logs.
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex flex-col gap-1 p-2 rounded-lg bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-[var(--md-sys-color-outline)] text-[10px] select-none">
                  {log.timestamp}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${getLevelStyle(
                    log.level
                  )}`}
                >
                  {log.level}
                </span>
                <span className="text-[var(--md-sys-color-on-surface)] font-medium break-all">
                  {log.message}
                </span>
              </div>
              {log.details && (
                <div className="pl-14 text-[var(--md-sys-color-on-surface-variant)] text-[10px] break-all leading-relaxed whitespace-pre-wrap">
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
