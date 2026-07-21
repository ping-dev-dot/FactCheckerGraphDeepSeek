import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export type CycleEdgeData = {
  isCycle: boolean;
  label?: string;
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isCycle = edgeData.isCycle;

  return (
    <>
      {/* Glow layer for cycles */}
      {isCycle && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: "#cba6f7",
            strokeWidth: 6,
            opacity: 0.25,
            filter: "blur(4px)",
          }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isCycle ? "#cba6f7" : "#585b70",
          strokeWidth: isCycle ? 2.5 : 1.5,
          strokeDasharray: isCycle ? "8 4" : undefined,
          animation: isCycle ? "dashdraw 0.6s linear infinite" : undefined,
        }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          className="absolute text-[10px] font-mono text-[#a6adc8] bg-[#1e1e2e]/80 px-1.5 py-0.5 rounded pointer-events-none"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          {edgeData.label ?? ""}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
