'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCitationGraph, useCalibration, useDatasetExport } from '@/hooks/useApi';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { DatasetExport, CalibrationData, CitationGraphData, CitationGraphEdge } from '@/hooks/useGraph';

type GraphNode = {
  id: string;
  type: 'claim' | 'evidence' | 'critique' | 'review' | 'decision';
  label: string;
  status?: string;
  criticality?: string;
  isCounter?: boolean;
  reliability?: string;
  severity?: string;
  verdict?: string;
  decisionStatus?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

type GraphEdge = CitationGraphEdge;

const NODE_COLORS: Record<string, string> = {
  claim: '#3b82f6',
  evidence: '#10b981',
  critique: '#f59e0b',
  review: '#8b5cf6',
  decision: '#ef4444',
};

const NODE_SHAPES: Record<string, string> = {
  claim: 'circle',
  evidence: 'rect',
  critique: 'diamond',
  review: 'triangle',
  decision: 'hexagon',
};

function CitationGraph() {
  const { projectId } = useParams() as { projectId: string };
  const { data: graphDataRaw, isLoading } = useCitationGraph(projectId);
  const graphData = graphDataRaw ? { data: graphDataRaw.data as CitationGraphData } : undefined;
  const { data: calibrationDataRaw } = useCalibration(projectId);
  const calibrationData = calibrationDataRaw ? { data: calibrationDataRaw.data as CalibrationData } : undefined;
  const { data: datasetDataRaw } = useDatasetExport(projectId);
  const datasetData = datasetDataRaw ? { data: datasetDataRaw.data as DatasetExport } : undefined;
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'calibration' | 'dataset'>('graph');
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    if (graphData?.data) {
      const initialNodes = graphData.data.nodes.map((n: GraphNode, i: number) => ({
        ...n,
        x: dimensions.width / 2 + (Math.random() - 0.5) * 400,
        y: dimensions.height / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
      }));
      setNodes(initialNodes);
      setEdges(graphData.data.edges);
    }
  }, [graphData, dimensions.width, dimensions.height]);

  // Simple force-directed layout
  useEffect(() => {
    if (nodes.length === 0 || edges.length === 0) return;
    setIsSimulating(true);

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    let iteration = 0;
    const maxIterations = 100;

    const tick = () => {
      if (iteration >= maxIterations) {
        setIsSimulating(false);
        return;
      }
      iteration++;

      setNodes(prev => {
        const updated = prev.map(n => ({ ...n }));
        const um = new Map(updated.map(u => [u.id, u]));

        // Repulsion between all nodes
        for (let i = 0; i < updated.length; i++) {
          for (let j = i + 1; j < updated.length; j++) {
            const a = updated[i], b = updated[j];
            const dx = b.x! - a.x!, dy = b.y! - a.y!;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = 500 / (dist * dist);
            const fx = (dx / dist) * force, fy = (dy / dist) * force;
            a.vx! -= fx; a.vy! -= fy;
            b.vx! += fx; b.vy! += fy;
          }
        }

        // Attraction along edges
        for (const e of edges) {
          const src = um.get(e.source);
          const tgt = um.get(e.target);
          if (!src || !tgt) continue;
          const dx = tgt.x! - src.x!, dy = tgt.y! - src.y!;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 100) * 0.01;
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          src.vx! += fx; src.vy! += fy;
          tgt.vx! -= fx; tgt.vy! -= fy;
        }

        // Center gravity
        for (const n of updated) {
          n.vx! += (dimensions.width / 2 - n.x!) * 0.001;
          n.vy! += (dimensions.height / 2 - n.y!) * 0.001;
          n.vx! *= 0.9;
          n.vy! *= 0.9;
          n.x! += n.vx!;
          n.y! += n.vy!;
          n.x = Math.max(30, Math.min(dimensions.width - 30, n.x!));
          n.y = Math.max(30, Math.min(dimensions.height - 30, n.y!));
        }

        return updated;
      });

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return () => { setIsSimulating(false); };
  }, [edges.length > 0, nodes.length > 0]);

  const handleExportDataset = useCallback(() => {
    if (!datasetData?.data) return;
    const blob = new Blob([JSON.stringify(datasetData.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dataset-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [datasetData, projectId]);

  if (isLoading) return <div className="p-8 text-center">Loading graph...</div>;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold mt-1">Citation Graph</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('graph')} className={`px-3 py-1.5 text-sm rounded ${activeTab === 'graph' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Graph</button>
          <button onClick={() => setActiveTab('calibration')} className={`px-3 py-1.5 text-sm rounded ${activeTab === 'calibration' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Calibration</button>
          <button onClick={() => setActiveTab('dataset')} className={`px-3 py-1.5 text-sm rounded ${activeTab === 'dataset' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>Dataset Export</button>
        </div>
      </div>

      {activeTab === 'graph' && (
        <div className="flex gap-6">
          <div className="flex-1 border rounded-lg bg-white overflow-hidden">
            <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const src = nodeMap.get(e.source);
                const tgt = nodeMap.get(e.target);
                if (!src || !tgt) return null;
                const color = e.relation === 'contradicts' ? '#ef4444' : e.relation === 'critiques' ? '#f59e0b' : '#94a3b8';
                return (
                  <line key={i} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                    stroke={color} strokeWidth={1.5} strokeDasharray={e.relation === 'contradicts' ? '5,5' : undefined}
                    markerEnd="url(#arrow)" opacity={0.6} />
                );
              })}
              {nodes.map(n => (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} onClick={() => setSelectedNode(n)} className="cursor-pointer">
                  <circle r={n.type === 'claim' ? 12 : n.type === 'decision' ? 14 : 10}
                    fill={NODE_COLORS[n.type]} opacity={0.9} stroke={selectedNode?.id === n.id ? '#000' : '#fff'} strokeWidth={selectedNode?.id === n.id ? 2 : 1} />
                  <text y={n.type === 'claim' ? -16 : -14} textAnchor="middle" fontSize="10" fill="#374151">
                    {n.label.substring(0, 25)}{n.label.length > 25 ? '...' : ''}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="w-64">
            <div className="mb-4">
              <h3 className="font-medium text-sm mb-2">Legend</h3>
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs capitalize">{type}</span>
                </div>
              ))}
              <div className="mt-2 text-xs text-gray-500">
                <div>Solid line = supports</div>
                <div>Dashed red = contradicts</div>
                <div>Amber = critiques</div>
              </div>
            </div>
            {selectedNode && (
              <div className="border rounded p-3 bg-gray-50">
                <h3 className="font-medium text-sm mb-1">Selected: {selectedNode.type}</h3>
                <p className="text-xs text-gray-600 mb-2">{selectedNode.label}</p>
                <div className="text-xs space-y-1">
                  {selectedNode.status && <div>Status: <span className="font-medium">{selectedNode.status}</span></div>}
                  {selectedNode.criticality && <div>Criticality: <span className="font-medium">{selectedNode.criticality}</span></div>}
                  {selectedNode.isCounter !== undefined && <div>Counter: <span className="font-medium">{selectedNode.isCounter ? 'Yes' : 'No'}</span></div>}
                  {selectedNode.reliability && <div>Reliability: <span className="font-medium">{selectedNode.reliability}</span></div>}
                  {selectedNode.severity && <div>Severity: <span className="font-medium">{selectedNode.severity}</span></div>}
                  {selectedNode.verdict && <div>Verdict: <span className="font-medium">{selectedNode.verdict}</span></div>}
                  {selectedNode.decisionStatus && <div>Status: <span className="font-medium">{selectedNode.decisionStatus}</span></div>}
                </div>
              </div>
            )}
            <div className="mt-4 text-xs text-gray-500">
              {nodes.length} nodes, {edges.length} edges
              {isSimulating && <span className="ml-2 text-blue-500">(simulating...)</span>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calibration' && calibrationData?.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Confidence Calibration</h2>
            <p className="text-sm text-gray-600 mb-4">How well do confidence scores predict actual claim support?</p>
            <div className="space-y-3">
              {calibrationData.data.calibrationBuckets?.map((b: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-16 text-right">{b.range}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden relative">
                    <div className="absolute left-0 top-0 h-full bg-blue-200" style={{ width: `${b.predicted * 100}%` }} />
                    <div className="absolute left-0 top-0 h-full bg-green-500 opacity-50" style={{ width: `${b.actual * 100}%` }} />
                  </div>
                  <span className="text-xs w-20">Pred: {(b.predicted * 100).toFixed(0)}% Act: {(b.actual * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-xs">
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-200 rounded" /> Predicted</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 opacity-50 rounded" /> Actual</div>
            </div>
          </div>
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Summary Statistics</h2>
            <div className="space-y-3">
              {calibrationData.data.summary && Object.entries(calibrationData.data.summary).map(([key, val]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                  <span className="font-medium">{typeof val === 'number' && val < 1 && val > 0 ? `${(val * 100).toFixed(0)}%` : String(val)}</span>
                </div>
              ))}
            </div>
          </div>
          {calibrationData.data.robustness && (
            <div className="border rounded-lg bg-white p-6 md:col-span-2">
              <h2 className="font-semibold mb-4">Adversarial Robustness</h2>
              <p className="text-sm text-gray-600 mb-4">How well do claims survive hostile scrutiny?</p>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">{calibrationData.data.robustness.robust}</div>
                  <div className="text-xs text-gray-500">Robust</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded">
                  <div className="text-2xl font-bold text-yellow-600">{calibrationData.data.robustness.challenged}</div>
                  <div className="text-xs text-gray-500">Challenged</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="text-2xl font-bold text-red-600">{calibrationData.data.robustness.vulnerable}</div>
                  <div className="text-xs text-gray-500">Vulnerable</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">{(calibrationData.data.robustness.robustnessScore * 100).toFixed(0)}%</div>
                  <div className="text-xs text-gray-500">Score</div>
                </div>
              </div>
              <div className="h-4 bg-gray-100 rounded overflow-hidden flex">
                <div className="bg-green-500" style={{ width: `${calibrationData.data.robustness.robustnessScore * 100}%` }} />
                <div className="bg-yellow-500" style={{ width: `${(calibrationData.data.robustness.challenged / Math.max(calibrationData.data.robustness.robust + calibrationData.data.robustness.challenged + calibrationData.data.robustness.vulnerable, 1)) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(calibrationData.data.robustness.vulnerable / Math.max(calibrationData.data.robustness.robust + calibrationData.data.robustness.challenged + calibrationData.data.robustness.vulnerable, 1)) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'dataset' && (
        <div className="border rounded-lg bg-white p-6">
          <h2 className="font-semibold mb-4">Dataset Export</h2>
          <p className="text-sm text-gray-600 mb-4">Export the full deliberation trace as structured JSON for training or evaluation.</p>
          {datasetData?.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['Claims', datasetData.data.claims?.length || 0],
                  ['Evidence', datasetData.data.evidence?.length || 0],
                  ['Reviews', datasetData.data.reviews?.length || 0],
                  ['Critiques', datasetData.data.critiques?.length || 0],
                  ['Decisions', datasetData.data.decisions?.length || 0],
                  ['Idea Versions', datasetData.data.ideaVersions?.length || 0],
                  ['Run Events', datasetData.data.runEvents?.length || 0],
                  ['Tasks', datasetData.data.tasks?.length || 0],
                ].map(([label, count]) => (
                  <div key={label} className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-2xl font-bold text-blue-600">{count}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              <button onClick={handleExportDataset} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
                Download JSON ({(JSON.stringify(datasetData.data).length / 1024).toFixed(1)} KB)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CitationGraph;
