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
        className="fixed lg:hidden inset-0 bg-black/60 z-40 cursor-pointer backdrop-blur-xs"
        onClick={onClose}
      />
      
      {/* Sidebar container - full width bottom sheet on mobile, fixed right on desktop */}
      <div className="fixed lg:static bottom-0 left-0 right-0 lg:left-auto lg:right-auto lg:bottom-auto z-50 lg:z-auto w-full lg:w-[340px] max-h-[60vh] lg:max-h-none bg-[var(--md-sys-color-surface-container)] border-t lg:border-t-0 lg:border-l border-[var(--md-sys-color-outline-variant)] flex flex-col h-auto lg:h-full overflow-hidden rounded-t-2xl lg:rounded-none shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <md-icon style={{ color: "var(--md-sys-color-primary)" }}>article</md-icon>
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              Statement {statement.id}
            </h2>
          </div>
          <md-icon-button onClick={onClose} aria-label="Close sidebar">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Statement text */}
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1">
              <md-icon style={{ fontSize: '14px' }}>chat_bubble_outline</md-icon>
              Statement
            </h3>
            <p className="text-sm text-[var(--md-sys-color-on-surface)] leading-relaxed bg-[var(--md-sys-color-surface-container-high)] p-3 rounded-lg border border-[var(--md-sys-color-outline-variant)]">
              {statement.text}
            </p>
          </div>

          {/* Fact-check difficulty */}
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1">
              <md-icon style={{ fontSize: '14px' }}>speed</md-icon>
              Fact-Check Difficulty
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <md-linear-progress
                  value={statement.factCheckDifficulty / 100}
                  style={{ width: "100%" }}
                ></md-linear-progress>
              </div>
              <span
                className="text-base font-bold font-mono"
                style={{
                  color: difficultyColor(statement.factCheckDifficulty),
                }}
              >
                {statement.factCheckDifficulty}%
              </span>
            </div>
            {statement.factCheckExplanation && (
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed italic">
                {statement.factCheckExplanation}
              </p>
            )}
          </div>

          <md-divider></md-divider>

          {/* Fallacies */}
          {fallacies.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-[var(--md-sys-color-error)] uppercase tracking-wider flex items-center gap-1">
                <md-icon style={{ fontSize: '16px', color: "var(--md-sys-color-error)" }}>report_problem</md-icon>
                Logical Fallacies
              </h3>
              {fallacies.map((f, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border border-[var(--md-sys-color-error-container)] bg-[var(--md-sys-color-error-container)]/30 flex flex-col gap-1"
                >
                  <div
                    className="text-xs font-bold"
                    style={{ color: FALLACY_COLOR }}
                  >
                    {f.fallacyType}
                  </div>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Cycles */}
          {cycles.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-[var(--md-sys-color-primary)] uppercase tracking-wider flex items-center gap-1">
                <md-icon style={{ fontSize: '16px', color: "var(--md-sys-color-primary)" }}>sync</md-icon>
                Circular Dependency
              </h3>
              {cycles.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border border-[var(--md-sys-color-primary-container)] bg-[var(--md-sys-color-primary-container)]/30 flex flex-col gap-1"
                >
                  <p className="text-xs font-mono font-semibold text-[var(--md-sys-color-on-primary-container)]">
                    Cycle: {c.nodeIds.join(" → ")}
                  </p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Relations */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider flex items-center gap-1">
              <md-icon style={{ fontSize: '16px' }}>schema</md-icon>
              Relations
            </h3>

            {incomingRels.length > 0 && (
              <div>
                <p className="text-[10px] text-[var(--md-sys-color-outline)] uppercase font-medium mb-1">
                  Incoming
                </p>
                {incomingRels.map((r, i) => (
                  <RelationBadge key={`in-${i}`} relation={r} />
                ))}
              </div>
            )}

            {outgoingRels.length > 0 && (
              <div>
                <p className="text-[10px] text-[var(--md-sys-color-outline)] uppercase font-medium mb-1">
                  Outgoing
                </p>
                {outgoingRels.map((r, i) => (
                  <RelationBadge key={`out-${i}`} relation={r} />
                ))}
              </div>
            )}

            {incomingRels.length === 0 && outgoingRels.length === 0 && (
              <p className="text-xs text-[var(--md-sys-color-outline)] italic">No relations</p>
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
    <div className="flex items-center gap-2 mb-1.5 text-xs">
      <span className="font-mono text-[var(--md-sys-color-on-surface)]">
        {relation.from} → {relation.to}
      </span>
      <span
        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
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
