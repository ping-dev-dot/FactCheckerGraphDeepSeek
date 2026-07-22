import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Statement, FactCheckVerdict } from "../types";
import { difficultyColor, difficultyBgColor, FALLACY_COLOR } from "../types";

export type StatementNodeData = Statement & {
  hasFallacy: boolean;
  isInCycle: boolean;
  speakerName?: string;
  speakerColor?: string;
  factCheckResult?: FactCheckVerdict | null;
};

export function StatementNode({ data, selected }: NodeProps) {
  const node = data as unknown as StatementNodeData;
  const hasVerdict = !!node.factCheckResult;
  const diffScore = hasVerdict ? 100 - node.factCheckResult!.confidence : node.factCheckDifficulty;
  const bg = difficultyBgColor(diffScore);
  const border = difficultyColor(diffScore);
  const cycleBorder = node.isInCycle ? "#cba6f7" : border;
  const fallacyBorder = node.hasFallacy ? FALLACY_COLOR : cycleBorder;

  return (
    <div
      className={`
        relative px-4 py-3 rounded-xl border-2 shadow-lg min-w-[180px] max-w-[280px]
        transition-all duration-200 cursor-pointer
        ${selected ? "ring-2 ring-[#89b4fa] scale-105" : ""}
      `}
      style={{
        background: bg,
        borderColor: fallacyBorder,
        boxShadow: node.isInCycle
          ? `0 0 12px rgba(203, 166, 247, 0.4), 0 0 24px rgba(203, 166, 247, 0.15)`
          : node.hasFallacy
            ? `0 0 10px rgba(243, 139, 168, 0.3)`
            : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#585b70]" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-[#a6adc8]">{node.id}</span>
        {node.speakerName && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full truncate max-w-[120px]"
            style={{
              background: (node.speakerColor ?? "#585b70") + "22",
              color: node.speakerColor ?? "#a6adc8",
              border: `1px solid ${(node.speakerColor ?? "#585b70")}44`,
            }}
          >
            {node.speakerName}
          </span>
        )}
      </div>
      <p className="text-sm text-[#cdd6f4] leading-snug line-clamp-3">
        {node.text}
      </p>
      <div className="flex items-center gap-2 mt-2">
        {node.factCheckResult ? (
          <>
            <div className="flex-1 h-1.5 rounded-full bg-[#313244] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${node.factCheckResult.confidence}%`,
                  background: node.factCheckResult.confidence >= 70
                    ? "#a6e3a1"
                    : node.factCheckResult.confidence >= 40
                      ? "#f9e2af"
                      : "#f38ba8",
                }}
              />
            </div>
            <span className="text-xs text-[#a6adc8] font-mono">
              {node.factCheckResult.confidence}%
            </span>
          </>
        ) : (
          <>
            <div className="flex-1 h-1.5 rounded-full bg-[#313244] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${node.factCheckDifficulty}%`,
                  background: `linear-gradient(90deg, #a6e3a1, #f9e2af, #f38ba8)`,
                }}
              />
            </div>
            <span className="text-xs text-[#a6adc8] font-mono">
              {node.factCheckDifficulty}%
            </span>
          </>
        )}
      </div>
      {node.hasFallacy && (
        <div className="mt-1.5 text-xs text-[#f38ba8] font-semibold">
          ⚠ Fallacy
        </div>
      )}
      {node.isInCycle && (
        <div className="mt-1.5 text-xs text-[#cba6f7] font-semibold">
          🔄 Cycle
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-[#585b70]" />
    </div>
  );
}
