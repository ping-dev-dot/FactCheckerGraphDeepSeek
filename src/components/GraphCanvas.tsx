import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "dagre";
import type { AnalysisResult, PartialAnalysisResult } from "../types";
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
}

function layoutGraph(result: AnalysisResult | PartialAnalysisResult): {
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

  const fallacyNodeIds = new Set<string>();
  for (const f of result.fallacies ?? []) {
    fallacyNodeIds.add(f.statementId);
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

  // If no edges, still run layout so nodes have positions
  if (relations.length === 0 && statements.length > 0) {
    // dagre needs edges to produce meaningful positions;
    // if none exist, use a simple grid layout
    dagre.layout(g);
  } else {
    dagre.layout(g);
  }

  const nodes: Node[] = statements.map((stmt) => {
    const pos = g.node(stmt.id);
    const hasFallacy = fallacyNodeIds.has(stmt.id);
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
        isInCycle,
        speakerName,
        speakerColor,
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
      } satisfies CycleEdgeData,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeIsCycle ? "#cba6f7" : "#585b70",
        width: 16,
        height: 16,
      },
      animated: edgeIsCycle,
    };
  });

  return { nodes, edges };
}

export function GraphCanvas({
  result,
  onNodeClick,
  onCanvasClick,
}: GraphCanvasProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutGraph(result),
    [result]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Re-layout when result changes
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

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-right"
        className="bg-[#11111b]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#313244"
        />
        <Controls className="!bg-[#1e1e2e] !border-[#45475a] !rounded-lg" />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as StatementNodeData | undefined;
            if (!d) return "#585b70";
            if (d.factCheckDifficulty <= 30) return "#a6e3a1";
            if (d.factCheckDifficulty <= 70) return "#f9e2af";
            return "#f38ba8";
          }}
          maskColor="rgba(17, 17, 27, 0.7)"
          className="!bg-[#1e1e2e] !border-[#45475a] !rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
