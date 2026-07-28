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
import type { AnalysisResult, PartialAnalysisResult, ThemeMode, Relation } from "../../shared/types";
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
  onEdgeSelect?: (relation: Relation) => void;
  onCanvasClick: () => void;
  themeMode?: ThemeMode;
}

const STAGGER_T = [0.32, 0.68, 0.50, 0.25, 0.75, 0.40, 0.60];

function layoutGraph(
  result: AnalysisResult | PartialAnalysisResult,
  themeMode: ThemeMode = "dark"
): {
  nodes: Node[];
  edges: Edge[];
} {
  const statements = result.statements ?? [];
  const rawRelations = result.relations ?? [];

  if (statements.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Create a map for resolving S1, S2, s1, s2 or UUIDs to valid statement IDs
  const idResolver = new Map<string, string>();
  statements.forEach((s, idx) => {
    idResolver.set(s.id, s.id);
    idResolver.set(s.id.toLowerCase(), s.id);
    idResolver.set(`s${idx + 1}`, s.id);
    idResolver.set(`s_${idx + 1}`, s.id);
    idResolver.set(`${idx + 1}`, s.id);
  });

  const resolveId = (rawId: string): string | null => {
    if (!rawId) return null;
    const cleaned = rawId.trim().toLowerCase();
    return idResolver.get(cleaned) || idResolver.get(rawId.trim()) || (idResolver.has(rawId) ? rawId : null);
  };

  const validNodeIds = new Set(statements.map((s) => s.id));

  // Sanitize relations: resolve IDs and discard invalid/dangling edges
  const relations = rawRelations
    .map((r) => ({
      ...r,
      from: resolveId(r.from),
      to: resolveId(r.to),
    }))
    .filter(
      (r): r is typeof r & { from: string; to: string } =>
        Boolean(r.from && r.to && validNodeIds.has(r.from) && validNodeIds.has(r.to) && r.from !== r.to)
    );

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 110,
    ranksep: 160,
    marginx: 60,
    marginy: 60,
  });

  const cycleNodeIds = new Set<string>();
  for (const cycle of result.cycles ?? []) {
    for (const rawId of cycle.nodeIds) {
      const resolved = resolveId(rawId);
      if (resolved) cycleNodeIds.add(resolved);
    }
  }

  const fallacyMap = new Map<string, string[]>();
  for (const f of result.fallacies ?? []) {
    const resolvedId = resolveId(f.statementId);
    if (resolvedId) {
      const existing = fallacyMap.get(resolvedId) ?? [];
      if (!existing.includes(f.fallacyType)) {
        existing.push(f.fallacyType);
      }
      fallacyMap.set(resolvedId, existing);
    }
  }

  // Add nodes to dagre
  for (const stmt of statements) {
    g.setNode(stmt.id, { width: 220, height: 120 });
  }

  // Add valid edges to dagre
  for (const rel of relations) {
    g.setEdge(rel.from, rel.to);
  }

  // Calculate layout with error catching
  try {
    dagre.layout(g);
  } catch (err) {
    console.error("[GraphCanvas] Dagre layout error, falling back to grid layout:", err);
  }

  const isLight = themeMode === "light";

  // Group relations by node pair key (independent of direction) to calculate multi-edge curvature offsets
  const pairCounts = new Map<string, number>();
  const pairIndices = new Map<string, number>();

  relations.forEach((rel) => {
    const pairKey = [rel.from, rel.to].sort().join("::");
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
  });

  // Build ReactFlow Nodes with safe non-NaN positioning
  const nodes: Node[] = statements.map((stmt, idx) => {
    const pos = g.node(stmt.id);
    const statementFallacies = fallacyMap.get(stmt.id) ?? [];
    const hasFallacy = statementFallacies.length > 0;
    const isInCycle = cycleNodeIds.has(stmt.id);

    // Resolve speaker name and color
    const speakers = result.speakers ?? [];
    const speaker = speakers.find((s) => s.id === (stmt.speakerId ?? ""));
    const speakerName = speaker?.name ?? stmt.speakerId;
    const speakerColor = speaker?.color;

    // Ensure positions are never NaN
    const xPos = typeof pos?.x === "number" && !isNaN(pos.x) ? pos.x - 110 : (idx % 3) * 260 + 60;
    const yPos = typeof pos?.y === "number" && !isNaN(pos.y) ? pos.y - 60 : Math.floor(idx / 3) * 160 + 60;

    return {
      id: stmt.id,
      type: "statementNode",
      position: {
        x: xPos,
        y: yPos,
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

  // Build ReactFlow Edges with curvature offsets & staggered label positions
  const edges: Edge[] = relations.map((rel, idx) => {
    const pairKey = [rel.from, rel.to].sort().join("::");
    const totalInPair = pairCounts.get(pairKey) || 1;
    const currentIndex = pairIndices.get(pairKey) || 0;
    pairIndices.set(pairKey, currentIndex + 1);

    const labelT = STAGGER_T[idx % STAGGER_T.length];
    const edgeIsCycle = cycleNodeIds.has(rel.from) && cycleNodeIds.has(rel.to);
    const relType = rel.type || "implication";

    let strokeColor = edgeIsCycle ? "#a855f7" : isLight ? "#a1a1aa" : "#52525b";
    if (relType === "contradiction" || relType === "fallacy") strokeColor = "#ef4444";
    else if (relType === "supports") strokeColor = "#22c55e";
    else if (relType === "implication") strokeColor = "#3b82f6";

    return {
      id: `e${idx}-${rel.from}-${rel.to}`,
      source: rel.from,
      target: rel.to,
      type: "argumentEdge",
      data: {
        relation: rel,
        isCycle: edgeIsCycle,
        label: rel.label ?? rel.type,
        pairIndex: currentIndex,
        totalInPair: totalInPair,
        labelT: labelT,
        themeMode,
      } satisfies CycleEdgeData,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
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
  onEdgeSelect,
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
    const timer = setTimeout(() => {
      fitView({ padding: 0.3, duration: 300 });
    }, 60);
    return () => clearTimeout(timer);
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick(node.id);
    },
    [onNodeClick]
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const edgeData = edge.data as CycleEdgeData | undefined;
      if (edgeData?.relation && onEdgeSelect) {
        onEdgeSelect(edgeData.relation);
      }
    },
    [onEdgeSelect]
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
        onEdgeClick={handleEdgeClick}
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
