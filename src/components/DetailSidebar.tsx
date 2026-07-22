import type { Statement, Relation, AnalysisResult, PartialAnalysisResult } from "../types";
import { difficultyColor, FALLACY_COLOR } from "../types";

interface DetailSidebarProps {
  statement: Statement | null;
  result: AnalysisResult | PartialAnalysisResult;
  onClose: () => void;
}

export function DetailSidebar({ statement, result, onClose }: DetailSidebarProps) {
  if (!statement) return null;

  const incomingRels = (result.relations ?? []).filter((r) => r.to === statement.id);
  const outgoingRels = (result.relations ?? []).filter((r) => r.from === statement.id);
  const fallacies = (result.fallacies ?? []).filter(
    (f) => f.statementId === statement.id
  );
  const cycles = (result.cycles ?? []).filter((c) =>
    c.nodeIds.includes(statement.id)
  );

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div 
        className="fixed lg:hidden inset-0 bg-black/50 z-40 cursor-pointer"
        onClick={onClose}
      />
      
      {/* Sidebar container - full width bottom sheet on mobile, fixed right on desktop */}
      <div className="fixed lg:static bottom-0 left-0 right-0 lg:left-auto lg:right-auto lg:bottom-auto z-50 lg:z-auto w-full lg:w-[340px] max-h-[60vh] lg:max-h-none bg-[#181825] border-t lg:border-t-0 lg:border-l border-[#313244] flex flex-col h-auto lg:h-full overflow-hidden rounded-t-lg lg:rounded-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244] flex-shrink-0">
          <h2 className="text-sm font-semibold text-[#cdd6f4]">
            Statement {statement.id}
          </h2>
          <button
            onClick={onClose}
            className="text-[#585b70] hover:text-[#cdd6f4] transition-colors text-lg leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Statement text */}
          <div>
            <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide mb-1">
              Statement
            </h3>
            <p className="text-sm text-[#cdd6f4] leading-relaxed">
              {statement.text}
            </p>
          </div>

          {/* Fact-check difficulty */}
          <div>
            <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide mb-2">
              Fact-Check Difficulty
            </h3>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1 h-3 rounded-full bg-[#313244] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${statement.factCheckDifficulty}%`,
                    background: `linear-gradient(90deg, #a6e3a1, #f9e2af, #f38ba8)`,
                  }}
                />
              </div>
              <span
                className="text-lg font-bold font-mono"
                style={{
                  color: difficultyColor(statement.factCheckDifficulty),
                }}
              >
                {statement.factCheckDifficulty}%
              </span>
            </div>
            {statement.factCheckExplanation && (
              <p className="text-xs text-[#a6adc8] leading-relaxed">
                {statement.factCheckExplanation}
              </p>
            )}
          </div>

          {/* Fallacies */}
          {fallacies.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#f38ba8] uppercase tracking-wide mb-2">
                ⚠ Logical Fallacies
              </h3>
              {fallacies.map((f, i) => (
                <div
                  key={i}
                  className="mb-2 p-3 rounded-lg border border-[#f38ba8]/30 bg-[#f38ba8]/5"
                >
                  <div
                    className="text-sm font-semibold mb-1"
                    style={{ color: FALLACY_COLOR }}
                  >
                    {f.fallacyType}
                  </div>
                  <p className="text-xs text-[#a6adc8] leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Cycles */}
          {cycles.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[#cba6f7] uppercase tracking-wide mb-2">
                🔄 Circular Dependency
              </h3>
              {cycles.map((c, i) => (
                <div
                  key={i}
                  className="mb-2 p-3 rounded-lg border border-[#cba6f7]/30 bg-[#cba6f7]/5"
                >
                  <p className="text-xs text-[#cdd6f4] leading-relaxed">
                    Cycle: {c.nodeIds.join(" → ")}
                  </p>
                  <p className="text-xs text-[#a6adc8] mt-1">{c.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Relations */}
          <div>
            <h3 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide mb-2">
              Relations
            </h3>

            {incomingRels.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-[#585b70] uppercase mb-1">
                  Incoming
                </p>
                {incomingRels.map((r, i) => (
                  <RelationBadge key={`in-${i}`} relation={r} />
                ))}
              </div>
            )}

            {outgoingRels.length > 0 && (
              <div>
                <p className="text-[10px] text-[#585b70] uppercase mb-1">
                  Outgoing
                </p>
                {outgoingRels.map((r, i) => (
                  <RelationBadge key={`out-${i}`} relation={r} />
                ))}
              </div>
            )}

            {incomingRels.length === 0 && outgoingRels.length === 0 && (
              <p className="text-xs text-[#585b70] italic">No relations</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function RelationBadge({ relation }: { relation: Relation }) {
  const typeColors: Record<string, string> = {
    implication: "#89b4fa",
    conjunction: "#a6e3a1",
    disjunction: "#f9e2af",
    supports: "#94e2d5",
    contradiction: "#f38ba8",
    fallacy: "#fab387",
  };

  return (
    <div className="flex items-center gap-2 mb-1 text-xs">
      <span className="font-mono text-[#cdd6f4]">
        {relation.from} → {relation.to}
      </span>
      <span
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
        style={{
          background: (typeColors[relation.type] ?? "#585b70") + "22",
          color: typeColors[relation.type] ?? "#a6adc8",
          border: `1px solid ${typeColors[relation.type] ?? "#585b70"}44`,
        }}
      >
        {relation.label ?? relation.type}
      </span>
    </div>
  );
}
