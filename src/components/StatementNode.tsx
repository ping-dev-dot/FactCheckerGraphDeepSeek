import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Statement } from "../types";
import { difficultyColor, FALLACY_COLOR } from "../types";

export type StatementNodeData = Statement & {
  hasFallacy: boolean;
  isInCycle: boolean;
  speakerName?: string;
  speakerColor?: string;
};

export function StatementNode({ data, selected }: NodeProps) {
  const node = data as unknown as StatementNodeData;
  const border = difficultyColor(node.factCheckDifficulty);
  const cycleBorder = node.isInCycle ? "#cba6f7" : border;
  const fallacyBorder = node.hasFallacy ? FALLACY_COLOR : cycleBorder;

  return (
    <div
      className={`
        relative px-4 py-3 rounded-2xl border min-w-[200px] max-w-[280px]
        transition-all duration-200 cursor-pointer bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]
        ${selected ? "ring-2 ring-[var(--md-sys-color-primary)] scale-105" : ""}
      `}
      style={{
        borderColor: fallacyBorder,
        boxShadow: node.isInCycle
          ? `0 0 12px rgba(203, 166, 247, 0.4)`
          : node.hasFallacy
            ? `0 0 10px rgba(243, 139, 168, 0.3)`
            : "0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <md-elevation></md-elevation>
      <Handle type="target" position={Position.Top} className="!bg-[var(--md-sys-color-outline)]" />
      
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-mono font-bold text-[var(--md-sys-color-primary)]">{node.id}</span>
        {node.speakerName && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full truncate max-w-[120px]"
            style={{
              background: (node.speakerColor ?? "#585b70") + "22",
              color: node.speakerColor ?? "var(--md-sys-color-on-surface-variant)",
              border: `1px solid ${(node.speakerColor ?? "#585b70")}44`,
            }}
          >
            {node.speakerName}
          </span>
        )}
      </div>

      <p className="text-sm text-[var(--md-sys-color-on-surface)] leading-snug line-clamp-3">
        {node.text}
      </p>

      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1">
          <md-linear-progress
            value={node.factCheckDifficulty / 100}
            style={{ width: "100%" }}
          ></md-linear-progress>
        </div>
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono font-semibold">
          {node.factCheckDifficulty}%
        </span>
      </div>

      {(node.hasFallacy || node.isInCycle) && (
        <div className="flex items-center gap-2 mt-2 pt-1 border-t border-[var(--md-sys-color-outline-variant)]">
          {node.hasFallacy && (
            <span className="text-[11px] font-semibold text-[var(--md-sys-color-error)] flex items-center gap-0.5">
              <md-icon style={{ fontSize: '14px', color: "var(--md-sys-color-error)" }}>warning</md-icon>
              Fallacy
            </span>
          )}
          {node.isInCycle && (
            <span className="text-[11px] font-semibold text-[var(--md-sys-color-primary)] flex items-center gap-0.5">
              <md-icon style={{ fontSize: '14px', color: "var(--md-sys-color-primary)" }}>sync</md-icon>
              Cycle
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-[var(--md-sys-color-outline)]" />
    </div>
  );
}
