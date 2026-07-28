import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { ThemeMode, Relation } from "../../shared/types";

export type CycleEdgeData = {
  relation?: Relation;
  isCycle: boolean;
  label?: string;
  pairIndex?: number;
  totalInPair?: number;
  labelIndex?: number;
  themeMode?: ThemeMode;
};

const STAGGER_OFFSETS = [0, -22, 22, -40, 40, -58, 58];

export function ArgumentEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const edgeData = (data ?? {}) as CycleEdgeData;
  const isLight = edgeData.themeMode === "light";
  const isCycle = edgeData.isCycle;
  const pairIndex = edgeData.pairIndex ?? 0;
  const totalInPair = edgeData.totalInPair ?? 1;
  const labelIndex = edgeData.labelIndex ?? pairIndex;

  // Calculate distinct curvature for multi-edges between the same pair of nodes
  let curvature = 0.25;
  if (totalInPair > 1) {
    const spread = 0.35;
    const offset = (pairIndex - (totalInPair - 1) / 2) * spread;
    curvature = 0.25 + offset;
  }

  const [edgePath, defaultLabelX, defaultLabelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });

  // Calculate perpendicular unit normal vector at midpoint (t = 0.5) to shift labels sideways into open space
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const nx = -dy / len;
  const ny = dx / len;

  const perpOffset = STAGGER_OFFSETS[labelIndex % STAGGER_OFFSETS.length];
  const labelX = defaultLabelX + nx * perpOffset;
  const labelY = defaultLabelY + ny * perpOffset;

  const defaultStroke = isLight ? "#a1a1aa" : "#52525b";
  const relType = edgeData.relation?.type || "implication";

  // Color coding by relation type
  let typeStroke = defaultStroke;
  if (isCycle) {
    typeStroke = "#a855f7"; // purple for cycle
  } else if (relType === "contradiction" || relType === "fallacy") {
    typeStroke = "#ef4444"; // red for contradiction/fallacy
  } else if (relType === "supports") {
    typeStroke = "#22c55e"; // green for supports
  } else if (relType === "implication") {
    typeStroke = "#3b82f6"; // blue for implication
  }

  return (
    <>
      {/* Invisible wide hit area for easy edge clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="cursor-pointer"
      />

      {/* Visible edge line with hover animation */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: typeStroke,
          strokeWidth: isCycle ? 2 : 1.75,
          strokeDasharray: isCycle ? "5 4" : undefined,
          transition: "stroke 0.2s, stroke-width 0.2s",
        }}
        className="hover:stroke-width-[3px] hover:brightness-125 cursor-pointer"
        markerEnd={markerEnd}
      />

      {/* Interactive Edge Label with separate positioning container & hover transform */}
      {edgeData.label && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-auto cursor-pointer z-10 select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <div
              className={`text-[10px] font-mono border px-2 py-0.5 rounded shadow-md transition-transform duration-150 ease-out hover:scale-110 ${
                isCycle
                  ? "bg-[#a855f7]/25 text-[#a855f7] border-[#a855f7]/60 font-semibold backdrop-blur-md"
                  : relType === "contradiction" || relType === "fallacy"
                  ? "bg-[#ef4444]/25 text-[#ef4444] border-[#ef4444]/60 font-semibold backdrop-blur-md"
                  : relType === "supports"
                  ? "bg-[#22c55e]/25 text-[#22c55e] border-[#22c55e]/60 font-semibold backdrop-blur-md"
                  : isLight
                  ? "text-[#18181b] bg-[#ffffff]/95 border-[#e4e4e7] hover:border-[#3b82f6] backdrop-blur-md"
                  : "text-[#f4f4f5] bg-[#1c1c20]/95 border-[#3f3f46] hover:border-[#3b82f6] backdrop-blur-md"
              }`}
              title="Klicken, um Begründung & Details dieser Verbindung anzuzeigen"
            >
              {edgeData.label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
