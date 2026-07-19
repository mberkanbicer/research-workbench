'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProject, useClaims } from '@/hooks/useApi';
import { useMemo, useState, useCallback, useRef } from 'react';
import GraphExport from '@/components/GraphExport';
import type { Node, Edge, NodeProps } from 'reactflow';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

// ─── Toulmin structure colors ───────────────────────────────────────────
const LAYER_COLORS = {
  claim: { bg: '#dbeafe', border: '#3b82f6', label: 'Claims', accent: '#2563eb' },
  evidence: { bg: '#d1fae5', border: '#10b981', label: 'Supporting Evidence', accent: '#059669' },
  counter: { bg: '#fee2e2', border: '#ef4444', label: 'Counter-Evidence', accent: '#dc2626' },
  critique: { bg: '#fef3c7', border: '#f59e0b', label: 'Critiques', accent: '#d97706' },
  response: { bg: '#ede9fe', border: '#8b5cf6', label: 'Responses', accent: '#7c3aed' },
  decision: { bg: '#fce7f3', border: '#ec4899', label: 'Decision', accent: '#db2777' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  supported: { bg: '#dcfce7', text: '#166534' },
  contradicted: { bg: '#fee2e2', text: '#991b1b' },
  unverified: { bg: '#f1f5f9', text: '#475569' },
  partially_supported: { bg: '#fef9c3', text: '#854d0e' },
  unsupported: { bg: '#fee2e2', text: '#991b1b' },
  needs_external_validation: { bg: '#ede9fe', text: '#5b21b6' },
};

// ─── Node components ────────────────────────────────────────────────────
function ClaimMapNode({ data }: NodeProps) {
  const statusStyle = STATUS_STYLES[data.status as string] || STATUS_STYLES.unverified;
  return (
    <div className="px-4 py-3 rounded-xl border-2 shadow-md min-w-[180px] max-w-[280px] bg-white">
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: LAYER_COLORS.claim.accent }}
      />
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: LAYER_COLORS.claim.accent }}
        />
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Claim</span>
        {data.criticality && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-auto ${
              data.criticality === 'high'
                ? 'bg-red-100 text-red-700'
                : data.criticality === 'medium'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {data.criticality}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-800 leading-snug">{data.label}</p>
      <div className="flex items-center gap-2 mt-2">
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
        >
          {data.status as string}
        </span>
        {data.confidence != null && (
          <span className="text-[10px] text-gray-400 ml-auto">
            {((data.confidence as number) * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: LAYER_COLORS.claim.accent }}
        id="evidence"
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: LAYER_COLORS.critique.accent }}
        id="critique"
      />
    </div>
  );
}

function EvidenceMapNode({ data }: NodeProps) {
  const isCounter = data.isCounter;
  const layer = isCounter ? LAYER_COLORS.counter : LAYER_COLORS.evidence;
  return (
    <div
      className="px-3 py-2 rounded-lg border shadow-sm min-w-[140px] max-w-[240px]"
      style={{ borderColor: layer.border, backgroundColor: '#fff' }}
    >
      <Handle type="target" position={Position.Top} style={{ background: layer.accent }} />
      <div className="flex items-center gap-1.5 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.accent }} />
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: layer.accent }}
        >
          {isCounter ? 'Counter-Evidence' : 'Evidence'}
        </span>
      </div>
      <p className="text-xs text-gray-700 leading-snug line-clamp-3">{data.label}</p>
      {data.reliability && (
        <span className="text-[9px] text-gray-400 mt-1 block">Reliability: {data.reliability}</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: layer.accent }} />
    </div>
  );
}

function CritiqueMapNode({ data }: NodeProps) {
  return (
    <div
      className="px-3 py-2 rounded-lg border shadow-sm min-w-[140px] max-w-[240px]"
      style={{ borderColor: LAYER_COLORS.critique.border, backgroundColor: '#fff' }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: LAYER_COLORS.critique.accent }}
      />
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: LAYER_COLORS.critique.accent }}
        />
        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600">
          Critique
        </span>
        {data.severity && (
          <span
            className={`text-[9px] px-1 rounded ml-auto ${
              data.severity === 'high'
                ? 'bg-red-100 text-red-700'
                : data.severity === 'medium'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {data.severity}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-700 leading-snug line-clamp-3">{data.label}</p>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: LAYER_COLORS.critique.accent }}
      />
    </div>
  );
}

function DecisionMapNode({ data }: NodeProps) {
  return (
    <div
      className="px-4 py-3 rounded-xl border-2 shadow-md min-w-[180px] max-w-[280px]"
      style={{ borderColor: LAYER_COLORS.decision.border, backgroundColor: '#fff' }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: LAYER_COLORS.decision.accent }}
      />
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: LAYER_COLORS.decision.accent }}
        />
        <span className="text-[10px] font-bold uppercase tracking-wider text-pink-600">
          Decision
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-800">{data.label}</p>
      {data.status && (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 inline-block bg-pink-100 text-pink-700">
          {data.status}
        </span>
      )}
    </div>
  );
}

const nodeTypes = {
  claim: ClaimMapNode,
  evidence: EvidenceMapNode,
  critique: CritiqueMapNode,
  decision: DecisionMapNode,
};

// ─── Main page ──────────────────────────────────────────────────────────
export default function ArgumentMapPage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading } = useProject(projectId);
  const { data: claimsData } = useClaims(projectId);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);

  const project = projectData?.data?.project;
  const claims = claimsData?.data || [];
  const evidence = project?.evidence || [];
  const critiques = project?.critiques || [];
  const decisions = project?.decisions || [];
  const reviews = project?.modelReviews || [];

  // Build the Toulmin layout
  const { initialNodes, initialEdges } = useMemo(() => {
    if (claims.length === 0) return { initialNodes: [], initialEdges: [] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Group evidence by claimId
    const evidenceByClaim = new Map<string, any[]>();
    for (const ev of evidence) {
      const claimId = ev.claimId;
      if (!claimId) continue;
      if (!evidenceByClaim.has(claimId)) evidenceByClaim.set(claimId, []);
      evidenceByClaim.get(claimId)!.push(ev);
    }

    // Group critiques by targetId (when targetType is 'claim')
    const critiquesByClaim = new Map<string, any[]>();
    for (const crit of critiques) {
      const claimId = crit.targetType === 'claim' ? crit.targetId : null;
      if (!claimId) continue;
      if (!critiquesByClaim.has(claimId)) critiquesByClaim.set(claimId, []);
      critiquesByClaim.get(claimId)!.push(crit);
    }

    // Layout: claims in a row at the top, evidence below each, critiques to the right
    const CLAIM_Y = 80;
    const EVIDENCE_Y = 280;
    const COUNTER_Y = 280;
    const CRITIQUE_Y = 280;
    const RESPONSE_Y = 460;
    const DECISION_Y = 620;
    const CLAIM_SPACING = 380;

    // Place claims
    claims.forEach((claim: any, i: number) => {
      const x = 200 + i * CLAIM_SPACING;
      nodes.push({
        id: claim.id,
        type: 'claim',
        position: { x, y: CLAIM_Y },
        data: {
          label: claim.text?.substring(0, 100) + (claim.text?.length > 100 ? '...' : ''),
          status: claim.status,
          criticality: claim.criticality,
          confidence: claim.confidence,
        },
      });

      // Place supporting evidence below
      const claimEvidence = evidenceByClaim.get(claim.id) || [];
      const supporting = claimEvidence.filter((e: any) => !e.isCounter);
      const counter = claimEvidence.filter((e: any) => e.isCounter);

      supporting.forEach((ev: any, j: number) => {
        const ex = x - 60 + j * 160;
        nodes.push({
          id: ev.id,
          type: 'evidence',
          position: { x: ex, y: EVIDENCE_Y + j * 100 },
          data: {
            label: ev.title?.substring(0, 80) || '',
            isCounter: false,
            reliability: ev.reliability,
          },
        });
        edges.push({
          id: `e-${claim.id}-${ev.id}`,
          source: claim.id,
          target: ev.id,
          sourceHandle: 'evidence',
          style: { stroke: LAYER_COLORS.evidence.accent, strokeWidth: 1.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: LAYER_COLORS.evidence.accent,
            width: 12,
            height: 12,
          },
          type: 'smoothstep',
          label: 'supports',
          labelStyle: { fill: '#6b7280', fontSize: 9 },
          labelBgStyle: { fill: '#f9fafb', fillOpacity: 0.9 },
          labelBgPadding: [3, 1] as [number, number],
          labelBgBorderRadius: 3,
        });
      });

      // Place counter-evidence
      counter.forEach((ev: any, j: number) => {
        const cx = x + 160 + j * 160;
        nodes.push({
          id: ev.id,
          type: 'evidence',
          position: { x: cx, y: COUNTER_Y + j * 100 },
          data: {
            label: ev.title?.substring(0, 80) || '',
            isCounter: true,
            reliability: ev.reliability,
          },
        });
        edges.push({
          id: `e-${claim.id}-${ev.id}`,
          source: claim.id,
          target: ev.id,
          sourceHandle: 'evidence',
          style: { stroke: LAYER_COLORS.counter.accent, strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: LAYER_COLORS.counter.accent,
            width: 12,
            height: 12,
          },
          type: 'smoothstep',
          label: 'counters',
          labelStyle: { fill: '#6b7280', fontSize: 9 },
          labelBgStyle: { fill: '#f9fafb', fillOpacity: 0.9 },
          labelBgPadding: [3, 1] as [number, number],
          labelBgBorderRadius: 3,
        });
      });

      // Place critiques to the right
      const claimCritiques = critiquesByClaim.get(claim.id) || [];
      claimCritiques.forEach((crit: any, j: number) => {
        const critX = x + 300 + j * 170;
        nodes.push({
          id: crit.id,
          type: 'critique',
          position: { x: critX, y: CRITIQUE_Y },
          data: {
            label: crit.text?.substring(0, 80) || '',
            severity: crit.severity,
          },
        });
        edges.push({
          id: `crit-${claim.id}-${crit.id}`,
          source: claim.id,
          target: crit.id,
          sourceHandle: 'critique',
          style: { stroke: LAYER_COLORS.critique.accent, strokeWidth: 1.5, strokeDasharray: '3 2' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: LAYER_COLORS.critique.accent,
            width: 12,
            height: 12,
          },
          type: 'smoothstep',
          label: 'critiques',
          labelStyle: { fill: '#6b7280', fontSize: 9 },
          labelBgStyle: { fill: '#f9fafb', fillOpacity: 0.9 },
          labelBgPadding: [3, 1] as [number, number],
          labelBgBorderRadius: 3,
        });
      });
    });

    // Place decisions at the bottom
    decisions.forEach((dec: any, i: number) => {
      const dx = 300 + i * 300;
      nodes.push({
        id: dec.id,
        type: 'decision',
        position: { x: dx, y: DECISION_Y },
        data: {
          label: dec.decisionStatus?.replace(/_/g, ' ') || 'Decision',
          status: dec.decisionStatus,
        },
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [claims, evidence, critiques, decisions]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading argument map...</p>
        </div>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <p className="text-lg text-gray-500 mb-4">No claims to visualize yet.</p>
        <p className="text-sm text-gray-400 mb-6">
          Run claim extraction from the project dashboard to build your argument map.
        </p>
        <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">
          &larr; Back to dashboard
        </Link>
      </div>
    );
  }

  // Stats
  const supportingCount = evidence.filter((e: any) => !e.isCounter).length;
  const counterCount = evidence.filter((e: any) => e.isCounter).length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${projectId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr;
          </Link>
          <h1 className="text-lg font-semibold">Argument Map</h1>
          <span className="text-xs text-gray-400">Toulmin Structure</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{claims.length} claims</span>
          <span>{supportingCount} supporting</span>
          <span>{counterCount} counter</span>
          <span>{critiques.length} critiques</span>
          <div className="w-px h-4 bg-gray-200" />
          <GraphExport
            graphRef={graphRef}
            filename={`argument-map-${projectId}`}
            jsonData={{ claims, evidence, critiques, decisions }}
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r bg-white p-3 overflow-y-auto shrink-0 space-y-4">
          {/* Layer legend */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Layers
            </h3>
            <div className="space-y-1.5">
              {Object.entries(LAYER_COLORS).map(([key, { bg, border, label }]) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: border }} />
                  <span className="text-gray-600">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* How to read */}
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              How to Read
            </h3>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>
                <strong>Top row:</strong> Claims with status and criticality
              </p>
              <p>
                <strong>Below claims:</strong> Supporting evidence (green) and counter-evidence
                (red)
              </p>
              <p>
                <strong>Right of claims:</strong> Critiques challenging each claim
              </p>
              <p>
                <strong>Bottom:</strong> Decision records
              </p>
            </div>
          </div>

          {/* Selected node detail */}
          {selectedNode && (
            <div className="border-t pt-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Selected
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        LAYER_COLORS[selectedNode.type as keyof typeof LAYER_COLORS]?.accent ||
                        '#94a3b8',
                    }}
                  />
                  <span className="text-[10px] font-bold uppercase">{selectedNode.type}</span>
                </div>
                <p className="text-xs text-gray-700 leading-snug">{selectedNode.data.label}</p>
                {selectedNode.data.status && (
                  <p className="text-[11px]">
                    <span className="text-gray-500">Status:</span>{' '}
                    <span className="font-medium">{selectedNode.data.status as string}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Graph canvas */}
        <div ref={graphRef} className="flex-1 bg-gray-50 relative">
          {/* Swim lane labels */}
          <div className="absolute top-2 left-16 z-10 flex gap-4 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <span>Claims</span>
            <span className="ml-[200px]">Evidence</span>
            <span className="ml-[100px]">Critiques</span>
          </div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#e2e8f0" />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(n) =>
                LAYER_COLORS[n.type as keyof typeof LAYER_COLORS]?.accent || '#94a3b8'
              }
              maskColor="rgba(0,0,0,0.08)"
              style={{ width: 120, height: 80 }}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
