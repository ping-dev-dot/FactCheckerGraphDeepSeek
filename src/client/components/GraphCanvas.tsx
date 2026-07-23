import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "dagre";
import { Focus } from "lucide-react";
import type { AnalysisResult, PartialAnalysisResult, ThemeMode } from "../../shared/types";
import { StatementNode } from "./StatementNode";
import { ArgumentEdge } from "./ArgumentEdge";
import type { StatementNodeData } from "./StatementNode";
import type { CycleEdgeData } from "./ArgumentEdge";

const nodeTypes = { statementNode: StatementNode };
const edgeTypes = { argumentEdge: ArgumentEdge };

interface GraphCanvasProps {
  /** Full or partial result. Works with both. */
  result: AnalysisResult | PartialAnalysisResult;
  onNodeClick: (nodeId: string) => void;
  onCanvasClick: () => void;
  themeMode?: ThemeMode;
}

function layoutGraph(
  result: AnalysisResult | PartialAnalysisResult,
  themeMode: ThemeMode = "dark"
): {
  nodes: Node[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 120,
    marginx: 60,
    marginy: 60,
  });

  const cycleNodeIds = new Set<string>();
  for (const cycle of result.cycles ?? []) {
    for (const id of cycle.nodeIds) {
      cycleNodeIds.add(id);
    }
  }

  const fallacyMap = new Map<string, string[]>();
  for (const f of result.fallacies ?? []) {
    const existing = fallacyMap.get(f.statementId) ?? [];
    if (!existing.includes(f.fallacyType)) {
      existing.push(f.fallacyType);
    }
    fallacyMap.set(f.statementId, existing);
  }

  const statements = result.statements ?? [];
  const relations = result.relations ?? [];

  // Add nodes
  for (const stmt of statements) {
    g.setNode(stmt.id, { width: 220, height: 120 });
  }

  // Add edges (if relations exist)
  for (const rel of relations) {
    g.setEdge(rel.from, rel.to);
  }

  dagre.layout(g);

  const isLight = themeMode === "light";

  const nodes: Node[] = statements.map((stmt) => {
    const pos = g.node(stmt.id);
    const statementFallacies = fallacyMap.get(stmt.id) ?? [];
    const hasFallacy = statementFallacies.length > 0;
    const isInCycle = cycleNodeIds.has(stmt.id);

    // Resolve speaker name and color
    const speakers = result.speakers ?? [];
    const speaker = speakers.find((s) => s.id === (stmt.speakerId ?? ""));
    const speakerName = speaker?.name ?? stmt.speakerId;
    const speakerColor = speaker?.color;

    return {
      id: stmt.id,
      type: "statementNode",
      position: {
        x: (pos?.x ?? 0) - 110,
        y: (pos?.y ?? 0) - 60,
      },
      data: {
        ...stmt,
        factCheckDifficulty: stmt.factCheckDifficulty ?? 50,
        hasFallacy,
        fallacyTypes: statementFallacies,
        isInCycle,
        speakerName,
        speakerColor,
        themeMode,
      } satisfies StatementNodeData,
    };
  });

  const edges: Edge[] = relations.map((rel, idx) => {
    const edgeIsCycle =
      cycleNodeIds.has(rel.from) && cycleNodeIds.has(rel.to);

    return {
      id: `e${idx}-${rel.from}-${rel.to}`,
      source: rel.from,
      target: rel.to,
      type: "argumentEdge",
      data: {
        isCycle: edgeIsCycle,
        label: rel.label ?? rel.type,
        themeMode,
      } satisfies CycleEdgeData,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeIsCycle ? "#a855f7" : isLight ? "#a1a1aa" : "#52525b",
        width: 14,
        height: 14,
      },
      animated: false,
    };
  });

  return { nodes, edges };
}

export function GraphCanvas({
  result,
  onNodeClick,
  onCanvasClick,
  themeMode = "dark",
}: GraphCanvasProps) {
  const isLight = themeMode === "light";
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutGraph(result, themeMode),
    [result, themeMode]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();

  // Re-layout when result or theme changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const handlePaneClick = useCallback(() => {
    onCanvasClick();
  }, [onCanvasClick]);

  const handleResetView = useCallback(() => {
    fitView({ padding: 0.3, duration: 250 });
  }, [fitView]);

  const hasContent = (result.statements ?? []).length > 0;

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={themeMode}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-right"
        className={isLight ? "bg-[#f8f9fa]" : "bg-[#09090b]"}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color={isLight ? "#e4e4e7" : "#3f3f46"}
        />
        <Controls className={isLight ? "!bg-[#ffffff] !border-[#e4e4e7] !text-[#18181b] shadow-sm" : "!bg-[#18181b] !border-[#3f3f46] shadow-sm"} />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as StatementNodeData | undefined;
            if (!d) return isLight ? "#a1a1aa" : "#71717a";
            if (d.factCheckDifficulty <= 30) return "#22c55e";
            if (d.factCheckDifficulty <= 70) return "#eab308";
            return "#ef4444";
          }}
          maskColor={isLight ? "rgba(248, 249, 250, 0.75)" : "rgba(9, 9, 11, 0.85)"}
          className={isLight ? "!bg-[#ffffff] !border-[#e4e4e7]" : "!bg-[#18181b] !border-[#3f3f46]"}
        />
      </ReactFlow>

      {/* Reset view button — visible when graph has content */}
      {hasContent && (
        <button
          onClick={handleResetView}
          title="Reset graph view"
          className={`absolute bottom-20 right-4 z-20 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors cursor-pointer shadow-sm flex items-center gap-1.5 ${
            isLight
              ? "bg-[#ffffff] border-[#e4e4e7] text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#18181b]"
              : "bg-[#18181b] border-[#3f3f46] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#f4f4f5]"
          }`}
          aria-label="Reset graph view"
        >
          <Focus className="w-3.5 h-3.5" />
          <span>Recenter</span>
        </button>
      )}
    </div>
  );
}




