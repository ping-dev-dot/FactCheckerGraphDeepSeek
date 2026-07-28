import {
  X,
  FileText,
  ShieldAlert,
  AlertOctagon,
  Repeat,
  GitFork,
  Search,
  ExternalLink,
  Globe,
  Info,
  ArrowDown,
  HelpCircle,
} from "lucide-react";
import type {
  Statement,
  Relation,
  AnalysisResult,
  PartialAnalysisResult,
  ThemeMode,
} from "../../shared/types";
import { difficultyColor } from "../../shared/types";

interface DetailSidebarProps {
  statement?: Statement | null;
  relation?: Relation | null;
  result: AnalysisResult | PartialAnalysisResult;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
  themeMode?: ThemeMode;
}

export function DetailSidebar({
  statement,
  relation,
  result,
  onClose,
  onSelectNode,
  themeMode = "dark",
}: DetailSidebarProps) {
  if (!statement && !relation) return null;

  const isLight = themeMode === "light";

  // ── Render Relation / Edge Detail View ──
  if (relation) {
    const fromStmt = (result.statements ?? []).find((s) => s.id === relation.from);
    const toStmt = (result.statements ?? []).find((s) => s.id === relation.to);
    const relType = relation.type || "implication";

    const isFallacy = relType === "fallacy" || relType === "contradiction";
    const isSupports = relType === "supports";

    return (
      <>
        {/* Mobile Backdrop */}
        <div
          className="fixed lg:hidden inset-0 bg-black/60 z-40 cursor-pointer"
          onClick={onClose}
        />

        {/* Sidebar Container */}
        <div
          className={`fixed lg:static bottom-0 left-0 right-0 lg:left-auto lg:right-auto lg:bottom-auto z-50 lg:z-auto w-full lg:w-[360px] max-h-[80vh] lg:max-h-none border-t lg:border-t-0 lg:border-l flex flex-col h-auto lg:h-full overflow-hidden rounded-t-lg lg:rounded-none shadow-xl ${
            isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
              isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <GitFork className="w-4 h-4 text-[#3b82f6]" />
              <h2
                className={`text-xs font-semibold tracking-tight uppercase ${
                  isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
                }`}
              >
                Verbindungs-Details
              </h2>
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${
                  isFallacy
                    ? "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30"
                    : isSupports
                    ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
                    : "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30"
                }`}
              >
                {relation.label || relType}
              </span>
            </div>

            <button
              onClick={onClose}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isLight ? "hover:bg-[#f4f4f5] text-[#71717a]" : "hover:bg-[#27272a] text-[#a1a1aa]"
              }`}
              title="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* From Statement */}
            <div className="space-y-1.5">
              <label className={`text-[10px] uppercase tracking-wider font-semibold font-mono ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
                Ursprung (Aussage A)
              </label>
              <div
                onClick={() => fromStmt && onSelectNode?.(fromStmt.id)}
                className={`p-3 rounded-md border transition-all cursor-pointer ${
                  isLight
                    ? "bg-[#f8f9fa] border-[#e4e4e7] hover:border-[#3b82f6]"
                    : "bg-[#09090b] border-[#3f3f46] hover:border-[#3b82f6]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[#3b82f6] mb-1">
                  <span>{fromStmt?.id ? `Satz ${fromStmt.id.slice(0, 8)}` : "Aussage A"}</span>
                  {fromStmt?.typ && (
                    <span className="uppercase text-[9px] px-1 py-0.2 rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10">
                      {fromStmt.typ}
                    </span>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                  {fromStmt?.text || relation.from}
                </p>
              </div>
            </div>

            {/* Relation Arrow Indicator */}
            <div className="flex items-center justify-center gap-2 py-1">
              <div className="h-px flex-1 bg-border border-t border-dashed border-[#3f3f46]/40" />
              <div className={`px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium flex items-center gap-1.5 ${
                isFallacy
                  ? "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/30"
                  : isSupports
                  ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
                  : "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/30"
              }`}>
                <span>{relation.label || relType}</span>
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
              <div className="h-px flex-1 bg-border border-t border-dashed border-[#3f3f46]/40" />
            </div>

            {/* To Statement */}
            <div className="space-y-1.5">
              <label className={`text-[10px] uppercase tracking-wider font-semibold font-mono ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
                Ziel (Aussage B)
              </label>
              <div
                onClick={() => toStmt && onSelectNode?.(toStmt.id)}
                className={`p-3 rounded-md border transition-all cursor-pointer ${
                  isLight
                    ? "bg-[#f8f9fa] border-[#e4e4e7] hover:border-[#3b82f6]"
                    : "bg-[#09090b] border-[#3f3f46] hover:border-[#3b82f6]"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[#3b82f6] mb-1">
                  <span>{toStmt?.id ? `Satz ${toStmt.id.slice(0, 8)}` : "Aussage B"}</span>
                  {toStmt?.typ && (
                    <span className="uppercase text-[9px] px-1 py-0.2 rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10">
                      {toStmt.typ}
                    </span>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                  {toStmt?.text || relation.to}
                </p>
              </div>
            </div>

            {/* Begründung / Details */}
            <div className="space-y-2 pt-2 border-t border-dashed border-[#3f3f46]/40">
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-[#3b82f6]" />
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                  Begründung & Logik-Details
                </h3>
              </div>

              <div
                className={`p-3 rounded-md border leading-relaxed text-xs font-sans whitespace-pre-wrap ${
                  isLight
                    ? "bg-[#f8f9fa] border-[#e4e4e7] text-[#3f3f46]"
                    : "bg-[#09090b] border-[#3f3f46] text-[#d4d4d8]"
                }`}
              >
                {relation.details || relation.label || "Keine zusätzliche Begründung in der Datenbank hinterlegt."}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Render Statement Detail View ──
  const incomingRels = (result.relations ?? []).filter((r) => r.to === statement.id);
  const outgoingRels = (result.relations ?? []).filter((r) => r.from === statement.id);
  const fallacies = (result.fallacies ?? []).filter(
    (f) => f.statementId === statement.id
  );
  const cycles = (result.cycles ?? []).filter((c) =>
    c.nodeIds.includes(statement.id)
  );

  const statementQueries = (result.queries ?? []).filter(
    (q) => q.statementId === statement.id
  );

  const statementResults = (result.queryResults ?? []).filter(
    (qr) => qr.statementId === statement.id
  );

  const statementSources = (result.factCheckSources ?? []).filter(
    (src) => src.statementId === statement.id
  );

  const diffColor = difficultyColor(statement.factCheckDifficulty);

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="fixed lg:hidden inset-0 bg-black/60 z-40 cursor-pointer"
        onClick={onClose}
      />

      {/* Sidebar container */}
      <div
        className={`fixed lg:static bottom-0 left-0 right-0 lg:left-auto lg:right-auto lg:bottom-auto z-50 lg:z-auto w-full lg:w-[360px] max-h-[75vh] lg:max-h-none border-t lg:border-t-0 lg:border-l flex flex-col h-auto lg:h-full overflow-hidden rounded-t-lg lg:rounded-none ${
          isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
            isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className={`text-xs font-semibold tracking-tight uppercase ${
                isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
              }`}
            >
              Statement {statement.id.slice(0, 8)}
            </h2>
            {statement.typ && (
              <span
                className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded border ${
                  statement.typ === "faktisch"
                    ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                    : statement.typ === "meinung"
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                }`}
              >
                {statement.typ}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isLight ? "hover:bg-[#f4f4f5] text-[#71717a]" : "hover:bg-[#27272a] text-[#a1a1aa]"
            }`}
            aria-label="Close detail panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Statement Text Card */}
          <div
            className={`p-3 rounded-md border ${
              isLight
                ? "bg-[#f8f9fa] border-[#e4e4e7]"
                : "bg-[#09090b] border-[#3f3f46]"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <FileText className="w-4 h-4 text-[#2563eb]" />
              <span
                className={`text-xs font-medium ${
                  isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
                }`}
              >
                Full Statement
              </span>
            </div>
            <p
              className={`text-xs leading-relaxed font-normal ${
                isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
              }`}
            >
              {statement.text}
            </p>
          </div>

          {/* Final Verdict Banner */}
          {statement.finalVerdict && (
            <div
              className={`p-3 rounded-md border ${
                statement.finalVerdict === "Wahr" || statement.finalVerdict === "Eher Wahr"
                  ? "bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]"
                  : statement.finalVerdict === "Falsch" || statement.finalVerdict === "Eher Falsch"
                  ? "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]"
                  : "bg-[#eab308]/10 border-[#eab308]/30 text-[#eab308]"
              }`}
            >
              <div className="flex items-center justify-between font-semibold text-xs mb-1">
                <span>Finales Urteil:</span>
                <span className="uppercase px-1.5 py-0.5 rounded border border-current font-mono text-[11px]">
                  {statement.finalVerdict}
                </span>
              </div>
              {statement.finalEvaluation && (
                <p className="text-xs leading-relaxed text-[#d4d4d8] font-sans">
                  {statement.finalEvaluation}
                </p>
              )}
            </div>
          )}

          {/* Fact-check Difficulty Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className={isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}>
                Fact-Check Difficulty
              </span>
              <span className="font-mono text-xs font-medium" style={{ color: diffColor }}>
                {statement.factCheckDifficulty}%
              </span>
            </div>
            <div
              className={`w-full h-1.5 rounded-full overflow-hidden ${
                isLight ? "bg-[#e4e4e7]" : "bg-[#27272a]"
              }`}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${statement.factCheckDifficulty}%`, backgroundColor: diffColor }}
              />
            </div>
            {statement.factCheckExplanation && (
              <p
                className={`text-[11px] leading-relaxed italic ${
                  isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
                }`}
              >
                {statement.factCheckExplanation}
              </p>
            )}
          </div>

          {/* Opinion info note if not factual */}
          {statement.typ && statement.typ !== "faktisch" && (
            <div
              className={`p-3 rounded-md border flex items-start gap-2.5 text-xs ${
                isLight ? "bg-[#f4f4f5] border-[#e4e4e7] text-[#71717a]" : "bg-[#27272a]/50 border-[#3f3f46] text-[#a1a1aa]"
              }`}
            >
              <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                Diese Aussage ist als <strong>{statement.typ}</strong> eingestuft und löst daher keine automatische Websuche aus.
              </p>
            </div>
          )}

          {/* Fallacies Section */}
          {fallacies.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#ef4444]">
                <ShieldAlert className="w-4 h-4" />
                <span>Logical Fallacies ({fallacies.length})</span>
              </div>
              <div className="space-y-1.5">
                {fallacies.map((f, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border border-[#ef4444]/30 bg-[#ef4444]/5 space-y-1 text-xs"
                  >
                    <span className="font-semibold text-[#ef4444] uppercase tracking-wider text-[10px]">
                      {f.fallacyType}
                    </span>
                    <p className={`text-[11px] leading-relaxed ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                      {f.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cycles Section */}
          {cycles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#a855f7]">
                <AlertOctagon className="w-4 h-4" />
                <span>Circular Reasoning ({cycles.length})</span>
              </div>
              <div className="space-y-1.5">
                {cycles.map((c, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border border-[#a855f7]/30 bg-[#a855f7]/5 space-y-1 text-xs"
                  >
                    <div className="flex items-center gap-1 text-[#a855f7] font-mono text-[10px]">
                      <Repeat className="w-3 h-3" />
                      <span>{c.nodeIds.map((id) => id.slice(0, 8)).join(" -> ")}</span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
                      {c.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Web Queries & Search Results */}
          {statementQueries.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-dashed border-[#3f3f46]/40">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Search className="w-4 h-4 text-[#3b82f6]" />
                <span className={isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}>
                  Web-Suchanfragen ({statementQueries.length})
                </span>
              </div>

              <div className="space-y-2">
                {statementQueries.map((q) => {
                  const qResults = statementResults.filter((qr) => qr.queryId === q.id);

                  return (
                    <div
                      key={q.id}
                      className={`p-2.5 rounded-md border space-y-2 text-xs ${
                        isLight ? "bg-[#f8f9fa] border-[#e4e4e7]" : "bg-[#09090b] border-[#3f3f46]"
                      }`}
                    >
                      <div className="font-mono text-[11px] text-[#3b82f6] flex items-center gap-1.5">
                        <Search className="w-3 h-3 flex-shrink-0" />
                        <span>"{q.text}"</span>
                      </div>

                      {/* Results for this query */}
                      {qResults.length > 0 && (
                        <div className="space-y-1.5 pl-2 border-l-2 border-[#3b82f6]/30">
                          {qResults.map((qr) => {
                            const evalSrc = statementSources.find((src) => src.queryResultId === qr.id);

                            return (
                              <div
                                key={qr.id}
                                className={`p-2 rounded border text-[11px] space-y-1.5 ${
                                  isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <a
                                    href={qr.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-[#3b82f6] hover:underline truncate flex items-center gap-1 text-[11px]"
                                  >
                                    <Globe className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{qr.title || qr.url}</span>
                                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                  </a>
                                </div>

                                {qr.snippets && qr.snippets.length > 0 && (
                                  <p className={`text-[10px] leading-relaxed line-clamp-3 italic ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
                                    "{qr.snippets[0]}"
                                  </p>
                                )}

                                {/* Nested Source Evaluation */}
                                {evalSrc && (
                                  <div
                                    className={`mt-1.5 p-1.5 rounded border text-[10px] space-y-0.5 ${
                                      evalSrc.urteil === "stuetzt"
                                        ? "bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]"
                                        : evalSrc.urteil === "widerlegt"
                                        ? "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]"
                                        : "bg-[#71717a]/10 border-[#71717a]/30 text-[#a1a1aa]"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-semibold">
                                      <span className="uppercase tracking-wider text-[9px]">
                                        Urteil: {evalSrc.urteil}
                                      </span>
                                      <span>{Math.round(evalSrc.konfidenz * 100)}% Konfidenz</span>
                                    </div>
                                    <p className="leading-relaxed font-sans text-[10px]">
                                      {evalSrc.begruendung}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Connected Relations List */}
          {(incomingRels.length > 0 || outgoingRels.length > 0) && (
            <div className="space-y-2 pt-2 border-t border-dashed border-[#3f3f46]/40">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <GitFork className="w-4 h-4 text-[#3b82f6]" />
                <span className={isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}>
                  Logische Verbindungen
                </span>
              </div>
              <div className="space-y-1.5">
                {outgoingRels.map((r, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded border text-xs flex items-center justify-between ${
                      isLight ? "bg-[#f8f9fa] border-[#e4e4e7]" : "bg-[#09090b] border-[#3f3f46]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-[10px] text-[#3b82f6]">-&gt;</span>
                      <span className="font-mono text-[10px] text-[#3b82f6]">{r.to.slice(0, 8)}</span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10">
                        {r.label || r.type}
                      </span>
                    </div>
                  </div>
                ))}
                {incomingRels.map((r, i) => (
                  <div
                    key={i}
                    className={`p-2 rounded border text-xs flex items-center justify-between ${
                      isLight ? "bg-[#f8f9fa] border-[#e4e4e7]" : "bg-[#09090b] border-[#3f3f46]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-[10px] text-[#3b82f6]">&lt;-</span>
                      <span className="font-mono text-[10px] text-[#3b82f6]">{r.from.slice(0, 8)}</span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded border border-[#3b82f6]/30 bg-[#3b82f6]/10">
                        {r.label || r.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
