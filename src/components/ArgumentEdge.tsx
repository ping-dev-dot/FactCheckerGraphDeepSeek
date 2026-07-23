import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { ThemeMode } from "../types";

export type CycleEdgeData = {
  isCycle: boolean;
  label?: string;
  themeMode?: ThemeMode;
};

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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isCycle = edgeData.isCycle;
  const defaultStroke = isLight ? "#a1a1aa" : "#52525b";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isCycle ? "#a855f7" : defaultStroke,
          strokeWidth: isCycle ? 2 : 1.5,
          strokeDasharray: isCycle ? "5 4" : undefined,
        }}
        markerEnd={markerEnd}
      />
      {edgeData.label && (
        <EdgeLabelRenderer>
          <div
            className={`absolute text-[10px] font-mono border px-1.5 py-0.5 rounded pointer-events-none shadow-sm ${
              isLight
                ? "text-[#71717a] bg-[#ffffff] border-[#e4e4e7]"
                : "text-[#f4f4f5] bg-[#1c1c20] border-[#3f3f46]"
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}

    </>
  );
}


