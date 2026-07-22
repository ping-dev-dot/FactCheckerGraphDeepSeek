import type { Statement, Relation, AnalysisResult, PartialAnalysisResult, FactCheckProgress, FactCheckSourceEval, FactCheckVerdict } from "../types";
import { difficultyColor, FALLACY_COLOR } from "../types";

interface DetailSidebarProps {
  statement: Statement | null;
  result: AnalysisResult | PartialAnalysisResult;
  onClose: () => void;
  factCheckProgress?: FactCheckProgress | null;
  factCheckSources?: FactCheckSourceEval[];
  factCheckVerdict?: FactCheckVerdict | null;
  braveKeyPresent?: boolean;
}

export function DetailSidebar({ statement, result, onClose, factCheckProgress, factCheckSources = [], factCheckVerdict = null, braveKeyPresent }: DetailSidebarProps) {
  if (!statement) return null;

  const incomingRels = (result.relations ?? []).filter((r) => r.to === statement.id);
  const outgoingRels = (result.relations ?? []).filter((r) => r.from === statement.id);
  const fallacies = (result.fallacies ?? []).filter(
    (f) => f.statementId === statement.id
  );
  const cycles = (result.cycles ?? []).filter((c) =>
    c.nodeIds.includes(statement.id)
  );

  const fcSources = factCheckSources;
  const fcResult = factCheckVerdict ?? undefined;

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div 
        className="fixed lg:hidden inset-0 bg-black/50 z-40"
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
            className="text-[#585b70] hover:text-[#cdd6f4] transition-colors text-lg leading-none"
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

          {/* Fact-check section */}
          {braveKeyPresent && (
            <div>
              <h3 className="text-xs font-semibold text-[#89b4fa] uppercase tracking-wide mb-2">
                🔍 Web Fact-Check
              </h3>

              {/* No verdict yet, no progress — waiting */}
              {!fcResult && !factCheckProgress && fcSources.length === 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-[#89b4fa]/5 border border-[#89b4fa]/20">
                  <span className="w-2 h-2 rounded-full bg-[#89b4fa] animate-pulse" />
                  <span className="text-xs text-[#a6adc8]">⏳ Fact-check results arriving soon...</span>
                </div>
              )}

              {/* Live progress */}
              {!fcResult && factCheckProgress && (
                <div className="p-3 rounded-lg bg-[#1e1e2e] border border-[#313244]">
                  {factCheckProgress.stage === "generating_terms" && (
                    <p className="text-xs text-[#a6adc8]">🔍 Finding the right search queries...</p>
                  )}
                  {factCheckProgress.stage === "searching" && (
                    <p className="text-xs text-[#a6adc8]">🌐 Searching web sources...</p>
                  )}
                  {factCheckProgress.stage === "evaluating" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#a6adc8]">📊 Evaluating sources</span>
                        <span className="text-[#89b4fa] font-mono">
                          {factCheckProgress.evaluatedSources}/{factCheckProgress.totalSources}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#313244] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#89b4fa] transition-all duration-300"
                          style={{
                            width: `${(factCheckProgress.evaluatedSources / Math.max(factCheckProgress.totalSources, 1)) * 100}%`,
                          }}
                        />
                      </div>
                      {/* Live source list */}
                      {fcSources.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1 max-h-32 overflow-y-auto">
                          {fcSources.map((s, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-xs">
                              <span className="mt-0.5 flex-shrink-0">
                                {s.verdict === "prove"
                                  ? "✓"
                                  : s.verdict === "disprove"
                                    ? "✗"
                                    : "—"}
                              </span>
                              <span
                                className="truncate"
                                style={{
                                  color:
                                    s.verdict === "prove"
                                      ? "#a6e3a1"
                                      : s.verdict === "disprove"
                                        ? "#f38ba8"
                                        : "#585b70",
                                }}
                              >
                                {s.hostname}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {factCheckProgress.stage === "finalizing" && (
                    <p className="text-xs text-[#a6adc8]">📋 Compiling final verdict...</p>
                  )}
                </div>
              )}

              {/* Final verdict card */}
              {fcResult && (
                <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#1e1e2e] border border-[#89b4fa]/30">
                  <p className="text-xs text-[#cdd6f4] leading-relaxed">
                    {fcResult.truthAssessment}
                  </p>
                  {/* Confidence bar */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#a6adc8] uppercase">Confidence</span>
                    <div className="flex-1 h-2 rounded-full bg-[#313244] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${fcResult.confidence}%`,
                          background:
                            fcResult.confidence >= 70
                              ? "#a6e3a1"
                              : fcResult.confidence >= 40
                                ? "#f9e2af"
                                : "#f38ba8",
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono text-[#cdd6f4]">{fcResult.confidence}%</span>
                  </div>
                  {/* Supporting evidence */}
                  {fcResult.supportingEvidence.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#a6e3a1] uppercase font-semibold mb-1">
                        Supporting
                      </p>
                      {fcResult.supportingEvidence.map((e, i) => (
                        <p key={i} className="text-xs text-[#a6adc8] leading-relaxed ml-2 mb-1">
                          • {e}
                        </p>
                      ))}
                    </div>
                  )}
                  {/* Contradicting evidence */}
                  {fcResult.contradictingEvidence.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#f38ba8] uppercase font-semibold mb-1">
                        Contradicting
                      </p>
                      {fcResult.contradictingEvidence.map((e, i) => (
                        <p key={i} className="text-xs text-[#a6adc8] leading-relaxed ml-2 mb-1">
                          • {e}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-[#585b70]">
                    Based on {fcSources.length} web source{fcSources.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          )}

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
