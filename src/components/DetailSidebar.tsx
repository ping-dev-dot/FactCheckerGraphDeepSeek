import { X, FileText, ShieldAlert, AlertOctagon, Repeat, GitFork } from "lucide-react";
import type { Statement, Relation, AnalysisResult, PartialAnalysisResult, ThemeMode } from "../types";
import { difficultyColor } from "../types";

interface DetailSidebarProps {
  statement: Statement | null;
  result: AnalysisResult | PartialAnalysisResult;
  onClose: () => void;
  themeMode?: ThemeMode;
}

export function DetailSidebar({ statement, result, onClose, themeMode = "dark" }: DetailSidebarProps) {
  if (!statement) return null;

  const isLight = themeMode === "light";
  const incomingRels = (result.relations ?? []).filter((r) => r.to === statement.id);
  const outgoingRels = (result.relations ?? []).filter((r) => r.from === statement.id);
  const fallacies = (result.fallacies ?? []).filter(
    (f) => f.statementId === statement.id
  );
  const cycles = (result.cycles ?? []).filter((c) =>
    c.nodeIds.includes(statement.id)
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
      <div className={`fixed lg:static bottom-0 left-0 right-0 lg:left-auto lg:right-auto lg:bottom-auto z-50 lg:z-auto w-full lg:w-[340px] max-h-[65vh] lg:max-h-none border-t lg:border-t-0 lg:border-l flex flex-col h-auto lg:h-full overflow-hidden rounded-t-lg lg:rounded-none ${
        isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
          isLight ? "bg-[#ffffff] border-[#e4e4e7]" : "bg-[#18181b] border-[#3f3f46]"
        }`}>
          <h2 className={`text-xs font-semibold tracking-tight uppercase ${
            isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
          }`}>
            Statement {statement.id}
          </h2>
          <button
            onClick={onClose}
            className={`transition-colors text-base leading-none cursor-pointer p-1 ${
              isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#a1a1aa] hover:text-[#f4f4f5]"
            }`}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          {/* Statement text */}
          <div>
            <h3 className={`text-[11px] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${
              isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
            }`}>
              <FileText className="w-3.5 h-3.5" />
              <span>Proposition Text</span>
            </h3>
            <p className={`text-sm leading-relaxed font-normal ${
              isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
            }`}>
              {statement.text}
            </p>
          </div>


          {/* Fact-check difficulty */}
          <div className={`pt-3 border-t ${isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5 ${
                isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
              }`}>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Fact-Check Difficulty</span>
              </h3>
              <span
                className="text-xs font-mono font-medium"
                style={{ color: diffColor }}
              >
                {statement.factCheckDifficulty}%
              </span>
            </div>
            <div className={`h-1.5 rounded overflow-hidden mb-2 ${
              isLight ? "bg-[#f4f4f5]" : "bg-[#27272a]"
            }`}>
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${statement.factCheckDifficulty}%`,
                  backgroundColor: diffColor,
                }}
              />
            </div>
            {statement.factCheckExplanation && (
              <p className={`text-xs leading-relaxed font-normal ${
                isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
              }`}>
                {statement.factCheckExplanation}
              </p>
            )}
          </div>

          {/* Fallacies */}
          {fallacies.length > 0 && (
            <div className={`pt-3 border-t ${isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"}`}>
              <h3 className="text-[11px] font-medium text-[#ef4444] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>Logical Fallacies ({fallacies.length})</span>
              </h3>
              {fallacies.map((f, i) => (
                <div
                  key={i}
                  className="mb-2 p-3 rounded-md border border-[#ef4444]/20 bg-[#ef4444]/5"
                >
                  <div className="text-xs font-medium text-[#ef4444] mb-1">
                    {f.fallacyType}
                  </div>
                  <p className={`text-xs leading-relaxed ${
                    isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
                  }`}>
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Cycles */}
          {cycles.length > 0 && (
            <div className={`pt-3 border-t ${isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"}`}>
              <h3 className="text-[11px] font-medium text-[#a855f7] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" />
                <span>Circular Dependencies ({cycles.length})</span>
              </h3>
              {cycles.map((c, i) => (
                <div
                  key={i}
                  className="mb-2 p-3 rounded-md border border-[#a855f7]/20 bg-[#a855f7]/5"
                >
                  <p className={`text-xs font-mono leading-relaxed mb-1 ${
                    isLight ? "text-[#18181b]" : "text-[#f4f4f5]"
                  }`}>
                    {c.nodeIds.join(" → ")}
                  </p>
                  <p className={`text-xs ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>{c.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Relations */}
          <div className={`pt-3 border-t ${isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"}`}>
            <h3 className={`text-[11px] font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5 ${
              isLight ? "text-[#71717a]" : "text-[#a1a1aa]"
            }`}>
              <GitFork className="w-3.5 h-3.5" />
              <span>Relations</span>
            </h3>



            {incomingRels.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1 font-mono">
                  Incoming
                </p>
                {incomingRels.map((r, i) => (
                  <RelationBadge key={`in-${i}`} relation={r} isLight={isLight} />
                ))}
              </div>
            )}

            {outgoingRels.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1 font-mono">
                  Outgoing
                </p>
                {outgoingRels.map((r, i) => (
                  <RelationBadge key={`out-${i}`} relation={r} isLight={isLight} />
                ))}
              </div>
            )}

            {incomingRels.length === 0 && outgoingRels.length === 0 && (
              <p className="text-xs text-[#71717a]">No connected relations</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function RelationBadge({ relation, isLight }: { relation: Relation; isLight?: boolean }) {
  const typeColors: Record<string, string> = {
    implication: "#60a5fa",
    conjunction: "#34d399",
    disjunction: "#fbbf24",
    supports: "#2dd4bf",
    contradiction: "#f87171",
    fallacy: "#fb923c",
    restates: "#a78bfa",
  };

  const color = typeColors[relation.type] ?? "#a1a1aa";

  return (
    <div className="flex items-center gap-2 mb-1.5 text-xs">
      <span className={`font-mono text-[11px] ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
        {relation.from} → {relation.to}
      </span>
      <span
        className="px-1.5 py-0.5 rounded text-[10px] font-medium border"
        style={{
          background: color + "15",
          color: color,
          borderColor: color + "30",
        }}
      >
        {relation.label ?? relation.type}
      </span>
    </div>
  );
}


