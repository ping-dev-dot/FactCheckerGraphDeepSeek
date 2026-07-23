import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertOctagon, Repeat, ShieldAlert } from "lucide-react";
import type { Statement, ThemeMode } from "../types";
import { difficultyColor, FALLACY_COLOR, CYCLE_COLOR } from "../types";

export type StatementNodeData = Statement & {
  hasFallacy: boolean;
  fallacyTypes?: string[];
  isInCycle: boolean;
  speakerName?: string;
  speakerColor?: string;
  themeMode?: ThemeMode;
};

function getDifficultyDescriptor(percent: number): { label: string; tag: string } {
  if (percent <= 30) return { label: "Easy to verify empirically", tag: "Easy" };
  if (percent <= 70) return { label: "Moderate verification effort", tag: "Mod" };
  return { label: "Hard or subjective to verify", tag: "Hard" };
}

export function StatementNode({ data, selected }: NodeProps) {
  const node = data as unknown as StatementNodeData;
  const isLight = node.themeMode === "light";
  const diffColor = difficultyColor(node.factCheckDifficulty);
  const diffInfo = getDifficultyDescriptor(node.factCheckDifficulty);
  const defaultBorder = isLight ? "#e4e4e7" : "#3f3f46";
  const borderColor = node.hasFallacy
    ? FALLACY_COLOR
    : node.isInCycle
      ? CYCLE_COLOR
      : defaultBorder;

  const fallacyList = node.fallacyTypes ?? [];
  const primaryFallacy = fallacyList[0] ?? "Fallacy";
  const extraFallacies = fallacyList.length > 1 ? ` (+${fallacyList.length - 1})` : "";

  return (
    <div
      className={`
        relative px-4 py-3 rounded-lg border min-w-[200px] max-w-[280px]
        transition-colors cursor-pointer shadow-sm
        ${isLight ? "bg-[#ffffff]" : "bg-[#1c1c20]"}
        ${selected ? "ring-2 ring-blue-500 border-blue-500" : ""}
      `}
      style={{
        borderColor: selected ? undefined : borderColor,
      }}
    >
      <Handle type="target" position={Position.Top} className={`!w-2 !h-2 ${isLight ? "!bg-[#a1a1aa]" : "!bg-[#3f3f46]"}`} />
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-[11px] font-mono font-medium tracking-tight ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
          {node.id}
        </span>
        {node.speakerName && (
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded border truncate max-w-[120px]"
            style={{
              borderColor: (node.speakerColor ?? "#52525b") + "44",
              background: (node.speakerColor ?? "#52525b") + "18",
              color: node.speakerColor ?? (isLight ? "#52525b" : "#a1a1aa"),
            }}
          >
            {node.speakerName}
          </span>
        )}
      </div>
      <p className={`text-xs leading-relaxed line-clamp-3 font-normal ${isLight ? "text-[#18181b]" : "text-[#f4f4f5]"}`}>
        {node.text}
      </p>

      {/* Fact-check difficulty bar with explicit label & tooltip */}
      <div
        className={`mt-3 pt-2 border-t flex flex-col gap-1 ${isLight ? "border-[#e4e4e7]" : "border-[#3f3f46]"}`}
        title={`Fact-Check Difficulty: ${node.factCheckDifficulty}% (${diffInfo.label})`}
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className={`flex items-center gap-1 font-medium select-none ${isLight ? "text-[#71717a]" : "text-[#a1a1aa]"}`}>
            <ShieldAlert className="w-3 h-3 flex-shrink-0" style={{ color: diffColor }} />
            <span>Fact-Check</span>
          </span>
          <span className="font-mono font-medium" style={{ color: diffColor }}>
            {node.factCheckDifficulty}% · {diffInfo.tag}
          </span>
        </div>
        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLight ? "bg-[#f4f4f5]" : "bg-[#27272a]"}`}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${node.factCheckDifficulty}%`,
              backgroundColor: diffColor,
            }}
          />
        </div>
      </div>

      {(node.hasFallacy || node.isInCycle) && (
        <div className="flex items-center gap-1.5 mt-2 pt-1 flex-wrap">
          {node.hasFallacy && (
            <span
              className="text-[10px] text-[#ef4444] font-medium px-1.5 py-0.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center gap-1 truncate max-w-[200px]"
              title={fallacyList.join(", ")}
            >
              <AlertOctagon className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{primaryFallacy}{extraFallacies}</span>
            </span>
          )}
          {node.isInCycle && (
            <span className="text-[10px] text-[#a855f7] font-medium px-1.5 py-0.5 rounded bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center gap-1">
              <Repeat className="w-3 h-3 flex-shrink-0" />
              <span>Cycle</span>
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className={`!w-2 !h-2 ${isLight ? "!bg-[#a1a1aa]" : "!bg-[#3f3f46]"}`} />
    </div>
  );
}



