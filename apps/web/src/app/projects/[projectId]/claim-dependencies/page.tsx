'use client';

import { useParams } from 'next/navigation';
import { useProjectClaimDependencies, useClaims, useAutoDetectDependencies } from '@/hooks/useApi';
import { useState, useMemo, useCallback, useEffect } from 'react';

interface Node {
  id: string;
  label: string;
  status: string;
  criticality: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  from: string;
  to: string;
  relation: string;
}

const STATUS_COLORS: Record<string, string> = {
  supported: '#3fb950',
  contradicted: '#f85149',
  unverified: '#8b949e',
  partially_supported: '#d29922',
  unsupported: '#f85149',
  needs_external_validation: '#bc8cff',
};

const CRITICALITY_SIZES: Record<string, number> = {
  blocking: 28,
  high: 24,
  medium: 20,
  low: 16,
};

const RELATION_COLORS: Record<string, string> = {
  supports: '#3fb950',
  depends_on: '#58a6ff',
  contradicts: '#f85149',
  refines: '#d29922',
};

export default function ClaimDependenciesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { data: claimsResponse } = useClaims(projectId);
  const claims = claimsResponse?.data || [];
  const { data: depsResponse } = useProjectClaimDependencies(projectId);
  const dependencies = depsResponse?.data || [];
  const autoDetect = useAutoDetectDependencies();

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: Math.min(window.innerWidth - 48, 1200),
        height: Math.min(window.innerHeight - 200, 700),
      });
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Build graph data
  const { nodes, edges } = useMemo(() => {
    const claimMap = new Map(claims.map((c: any) => [c.id, c]));
    const nodeList: Node[] = claims.map((c: any, i: number) => {
      const angle = (2 * Math.PI * i) / Math.max(claims.length, 1);
      const radius = Math.min(dimensions.width, dimensions.height) * 0.35;
      return {
        id: c.id,
        label: c.text.substring(0, 50) + (c.text.length > 50 ? '...' : ''),
        status: c.status,
        criticality: c.criticality,
        x: dimensions.width / 2 + radius * Math.cos(angle),
        y: dimensions.height / 2 + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    const edgeList: Edge[] = dependencies.map((d: any) => ({
      from: d.fromClaimId || d.claimId,
      to: d.toClaimId || d.dependsOnClaimId,
      relation: d.relation || d.dependencyType || 'depends_on',
    }));

    return { nodes: nodeList, edges: edgeList };
  }, [claims, dependencies, dimensions]);

  // Simple force simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    let animFrame: number;

    const simulate = () => {
      // Repulsion between nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 5000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) continue;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 150) * 0.01;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        from.vx += fx;
        from.vy += fy;
        to.vx -= fx;
        to.vy -= fy;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (dimensions.width / 2 - node.x) * 0.001;
        node.vy += (dimensions.height / 2 - node.y) * 0.001;
        // Apply velocity with damping
        node.x += node.vx * 0.3;
        node.y += node.vy * 0.3;
        node.vx *= 0.8;
        node.vy *= 0.8;
        // Clamp to bounds
        node.x = Math.max(40, Math.min(dimensions.width - 40, node.x));
        node.y = Math.max(40, Math.min(dimensions.height - 40, node.y));
      }

      animFrame = requestAnimationFrame(simulate);
    };

    animFrame = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animFrame);
  }, [nodes, edges, dimensions]);

  const handleNodeClick = useCallback((id: string) => {
    setSelectedNode(selectedNode === id ? null : id);
  }, [selectedNode]);

  const selectedClaim = selectedNode ? claims.find((c: any) => c.id === selectedNode) : null;
  const connectedEdges = selectedNode
    ? edges.filter((e) => e.from === selectedNode || e.to === selectedNode)
    : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Claim Dependencies</h1>
          <p className="text-gray-500 text-sm mt-1">
            Force-directed graph showing how claims relate to each other
          </p>
        </div>
        <button
          onClick={() => autoDetect.mutate(projectId)}
          disabled={autoDetect.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {autoDetect.isPending ? 'Detecting...' : 'Auto-Detect Dependencies'}
        </button>
      </div>

      {claims.length < 2 ? (
        <div className="text-center py-12 text-gray-500">
          Need at least 2 claims to show dependencies. Run claim extraction first.
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Graph */}
          <div className="flex-1 bg-gray-50 rounded-lg border overflow-hidden">
            <svg
              width={dimensions.width}
              height={dimensions.height}
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            >
              {/* Edges */}
              {edges.map((edge, i) => {
                const from = nodes.find((n) => n.id === edge.from);
                const to = nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                const color = RELATION_COLORS[edge.relation] || '#8b949e';
                const isHighlighted = selectedNode === edge.from || selectedNode === edge.to;
                return (
                  <g key={i}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={color}
                      strokeWidth={isHighlighted ? 3 : 1.5}
                      strokeOpacity={isHighlighted ? 1 : 0.5}
                      markerEnd="url(#arrowhead)"
                    />
                    <text
                      x={(from.x + to.x) / 2}
                      y={(from.y + to.y) / 2 - 6}
                      textAnchor="middle"
                      fontSize="10"
                      fill={color}
                      opacity={isHighlighted ? 1 : 0.6}
                    >
                      {edge.relation}
                    </text>
                  </g>
                );
              })}

              {/* Arrow marker */}
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="10"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#8b949e" />
                </marker>
              </defs>

              {/* Nodes */}
              {nodes.map((node) => {
                const isSelected = selectedNode === node.id;
                const isConnected = connectedEdges.some(
                  (e) => e.from === node.id || e.to === node.id
                );
                const r = CRITICALITY_SIZES[node.criticality] || 20;
                const color = STATUS_COLORS[node.status] || '#8b949e';
                return (
                  <g
                    key={node.id}
                    onClick={() => handleNodeClick(node.id)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={color}
                      fillOpacity={isSelected || isConnected ? 1 : 0.7}
                      stroke={isSelected ? '#fff' : 'transparent'}
                      strokeWidth={isSelected ? 3 : 0}
                    />
                    <text
                      x={node.x}
                      y={node.y + r + 14}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#374151"
                      className="pointer-events-none"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Detail panel */}
          <div className="w-80 shrink-0">
            <div className="bg-white rounded-lg border p-4 sticky top-6">
              <h3 className="font-semibold mb-3">Legend</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Supported</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Contradicted / Unsupported</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span>Partially Supported</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span>Unverified</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-400" />
                  <span>Needs External Validation</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t">
                <h3 className="font-semibold mb-2">Relations</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-green-500" />
                    <span>supports</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-blue-500" />
                    <span>depends_on</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-red-500" />
                    <span>contradicts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-yellow-500" />
                    <span>refines</span>
                  </div>
                </div>
              </div>

              {selectedClaim && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-semibold mb-2">Selected Claim</h3>
                  <p className="text-sm text-gray-700 mb-2">{selectedClaim.text}</p>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="font-medium">Status:</span>{' '}
                      <span style={{ color: STATUS_COLORS[selectedClaim.status] }}>
                        {selectedClaim.status}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Criticality:</span> {selectedClaim.criticality}
                    </div>
                    <div>
                      <span className="font-medium">Connections:</span> {connectedEdges.length}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                <p>{nodes.length} claims, {edges.length} dependencies</p>
                <p className="mt-1">Click a node to inspect. Click again to deselect.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
