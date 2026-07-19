'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProjectClaimDependencies, useClaims, useAutoDetectDependencies } from '@/hooks/useApi';
import { useState, useMemo, useCallback } from 'react';
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

// ─── Status colors ──────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  supported: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  contradicted: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  unverified: { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
  partially_supported: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  unsupported: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  needs_external_validation: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
};

const STATUS_ICONS: Record<string, string> = {
  supported: '\u2705',
  contradicted: '\u274C',
  unverified: '\u2753',
  partially_supported: '\u26A0\uFE0F',
  unsupported: '\u274C',
  needs_external_validation: '\uD83D\uDD0D',
};

const RELATION_STYLES: Record<string, { color: string; dash?: string }> = {
  supports: { color: '#10b981' },
  depends_on: { color: '#3b82f6', dash: '6 3' },
  contradicts: { color: '#ef4444', dash: '4 2' },
  refines: { color: '#f59e0b' },
};

// ─── Custom claim node ──────────────────────────────────────────────────
function ClaimDepNode({ data }: NodeProps) {
  const colors = STATUS_COLORS[data.status as string] || STATUS_COLORS.unverified;
  const icon = STATUS_ICONS[data.status as string] || '';
  return (
    <div
      className="px-4 py-3 rounded-xl border-2 shadow-sm cursor-pointer hover:shadow-md transition-all min-w-[140px] max-w-[260px]"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <Handle type="target" position={Position.Top} style={{ background: colors.border }} />
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-sm">{icon}</span>}
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: colors.text }}
        >
          {data.criticality as string}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: colors.text }}>
        {data.label}
      </p>
      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
}

const nodeTypes = { claim: ClaimDepNode };

// ─── Main page ──────────────────────────────────────────────────────────
export default function ClaimDependenciesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { data: claimsResponse } = useClaims(projectId);
  const claims = claimsResponse?.data || [];
  const { data: depsResponse } = useProjectClaimDependencies(projectId);
  const dependencies = depsResponse?.data || [];
  const autoDetect = useAutoDetectDependencies();

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Build React Flow data
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = claims.map((c: any, i: number) => ({
      id: c.id,
      type: 'claim',
      position: {
        x: (i % 4) * 300 + Math.random() * 30,
        y: Math.floor(i / 4) * 200 + Math.random() * 30,
      },
      data: {
        label: c.text.substring(0, 80) + (c.text.length > 80 ? '...' : ''),
        status: c.status,
        criticality: c.criticality,
      },
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: Edge[] = dependencies
      .filter((d: any) => {
        const from = d.fromClaimId || d.claimId;
        const to = d.toClaimId || d.dependsOnClaimId;
        return from && to && nodeIds.has(from) && nodeIds.has(to);
      })
      .map((d: any, i: number) => {
        const relation = d.relation || d.dependencyType || 'depends_on';
        const style = RELATION_STYLES[relation] || RELATION_STYLES.depends_on;
        return {
          id: `dep-${i}`,
          source: d.fromClaimId || d.claimId,
          target: d.toClaimId || d.dependsOnClaimId,
          label: relation,
          labelStyle: { fill: '#64748b', fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: { type: MarkerType.ArrowClosed, color: style.color, width: 16, height: 16 },
          style: { stroke: style.color, strokeWidth: 2, strokeDasharray: style.dash },
          type: 'smoothstep',
        };
      });

    return { initialNodes: nodes, initialEdges: edges };
  }, [claims, dependencies]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const selectedClaim = selectedNode ? claims.find((c: any) => c.id === selectedNode.id) : null;

  if (claims.length < 2) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${projectId}`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr;
            </Link>
            <h1 className="text-lg font-semibold">Claim Dependencies</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="text-lg mb-2">Need at least 2 claims to show dependencies.</p>
            <p className="text-sm">Run claim extraction first from the project dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-lg font-semibold">Claim Dependencies</h1>
          <span className="text-xs text-gray-400">
            {claims.length} claims, {dependencies.length} dependencies
          </span>
        </div>
        <button
          onClick={() => autoDetect.mutate(projectId)}
          disabled={autoDetect.isPending}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {autoDetect.isPending ? 'Detecting...' : 'Auto-Detect Dependencies'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r bg-white p-4 overflow-y-auto shrink-0 space-y-5">
          {/* Status legend */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Claim Status
            </h3>
            <div className="space-y-1.5">
              {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors.border }} />
                  <span className="text-xs capitalize">{status.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Edge legend */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Dependencies
            </h3>
            <div className="space-y-1.5 text-xs">
              {Object.entries(RELATION_STYLES).map(([relation, { color, dash }]) => (
                <div key={relation} className="flex items-center gap-2">
                  <svg width="24" height="2">
                    <line
                      x1="0"
                      y1="1"
                      x2="24"
                      y2="1"
                      stroke={color}
                      strokeWidth="2"
                      strokeDasharray={dash}
                    />
                  </svg>
                  <span className="text-gray-600">{relation.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected claim details */}
          {selectedClaim && (
            <div className="border-t pt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Selected Claim
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-sm text-gray-700 leading-relaxed">{selectedClaim.text}</p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span
                      className="font-medium"
                      style={{ color: STATUS_COLORS[selectedClaim.status]?.border }}
                    >
                      {STATUS_ICONS[selectedClaim.status] || ''}{' '}
                      {selectedClaim.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Criticality</span>
                    <span className="font-medium">{selectedClaim.criticality}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Connections</span>
                    <span className="font-medium">
                      {
                        edges.filter(
                          (e) => e.source === selectedClaim.id || e.target === selectedClaim.id,
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-[11px] text-gray-400 pt-2 border-t">
            Click a node to inspect. Scroll to zoom. Drag to reposition.
          </div>
        </div>

        {/* Graph canvas */}
        <div className="flex-1 bg-gray-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="#e2e8f0" />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeColor={(n) => STATUS_COLORS[n.data?.status as string]?.border || '#94a3b8'}
              maskColor="rgba(0,0,0,0.08)"
              style={{ width: 140, height: 100 }}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
