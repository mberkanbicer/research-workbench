'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useCreateDecision } from "@/hooks/useApi";
import { useState } from "react";
import Pagination from "@/components/Pagination";

function RecordDecisionModal({ projectId, versions, onClose }: { projectId: string; versions: any[]; onClose: () => void }) {
  const [formData, setFormData] = useState({
    decisionStatus: 'qualified_consensus',
    decisionText: '',
    ideaVersionId: versions[0]?.id || ''
  });
  const createDecision = useCreateDecision(projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createDecision.mutateAsync(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <header className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Record Manual Decision</h2>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Target Version</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={formData.ideaVersionId} onChange={e => setFormData(p => ({ ...p, ideaVersionId: e.target.value }))}>
              {versions.map(v => <option key={v.id} value={v.id}>Version {v.versionNumber}: {v.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Decision Status</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={formData.decisionStatus} onChange={e => setFormData(p => ({ ...p, decisionStatus: e.target.value }))}>
              <option value="full_consensus">Full Consensus</option>
              <option value="qualified_consensus">Qualified Consensus</option>
              <option value="no_consensus">No Consensus</option>
              <option value="insufficient_evidence">Insufficient Evidence</option>
              <option value="needs_external_validation">Needs External Validation</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Decision Text</label>
            <textarea required rows={5} className="w-full border rounded px-3 py-2 text-sm" value={formData.decisionText} onChange={e => setFormData(p => ({ ...p, decisionText: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={createDecision.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {createDecision.isPending ? 'Recording...' : 'Record Decision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DecisionDetailCard({ decision }: { decision: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-6 hover:bg-gray-50 transition-colors flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold capitalize">{decision.decisionStatus?.replace(/_/g, ' ')}</h2>
          <p className="text-sm text-gray-500 mt-1">ID: {decision.id.slice(0, 8)}...</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">{new Date(decision.createdAt).toLocaleDateString()}</p>
          <p className="text-xs text-gray-300 mt-1">{expanded ? '▲ Collapse' : '▼ Expand'}</p>
        </div>
      </button>

      <div className="px-6 pb-6">
        <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 rounded-lg p-4">
          <p className="whitespace-pre-wrap">{decision.decisionText}</p>
        </div>

        {expanded && (
          <div className="mt-4 space-y-5 border-t pt-6">
            {/* Why Good */}
            {decision.whyGood?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">Strengths / Why Good</p>
                <ul className="space-y-1">
                  {decision.whyGood.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Why Bad */}
            {decision.whyBad?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Weaknesses / Why Bad</p>
                <ul className="space-y-1">
                  {decision.whyBad.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Known Weaknesses */}
            {decision.knownWeaknesses?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-2">Known Weaknesses</p>
                <ul className="space-y-1">
                  {decision.knownWeaknesses.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-orange-500 mt-0.5">⚠</span>
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Accepted Evidence */}
            {decision.acceptedEvidenceIds?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Accepted Evidence ({decision.acceptedEvidenceIds.length})</p>
                <div className="flex flex-wrap gap-1">
                  {decision.acceptedEvidenceIds.map((id: string) => (
                    <span key={id} className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded font-mono border border-green-200">{id.slice(0, 8)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Counter Evidence */}
            {decision.counterEvidenceIds?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Counter-Evidence ({decision.counterEvidenceIds.length})</p>
                <div className="flex flex-wrap gap-1">
                  {decision.counterEvidenceIds.map((id: string) => (
                    <span key={id} className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded font-mono border border-red-200">{id.slice(0, 8)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Model Votes */}
            {decision.modelFinalVotes?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Model Final Votes</p>
                <div className="space-y-2">
                  {decision.modelFinalVotes.map((vote: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 text-sm">
                      <span className="font-medium text-gray-700">{vote.model || `Model ${i + 1}`}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        vote.vote === 'accept' ? 'bg-green-100 text-green-800' :
                        vote.vote === 'accept_with_reservations' ? 'bg-yellow-100 text-yellow-800' :
                        vote.vote === 'reject' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>{vote.vote?.replace(/_/g, ' ')}</span>
                      {vote.confidence != null && (
                        <span className="text-xs text-gray-400">confidence: {vote.confidence}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Critiques */}
            {decision.resolvedCritiqueIds?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Resolved Critiques ({decision.resolvedCritiqueIds.length})</p>
                <div className="flex flex-wrap gap-1">
                  {decision.resolvedCritiqueIds.map((id: string) => (
                    <span key={id} className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-mono">{id.slice(0, 8)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Unresolved Risks */}
            {decision.unresolvedRisks?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Unresolved Risks</p>
                <ul className="space-y-1">
                  {decision.unresolvedRisks.map((risk: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-red-500 mt-0.5">●</span>
                      <span className="text-gray-700">{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reopen Conditions */}
            {decision.reopenConditions?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Reopen Conditions</p>
                <ul className="space-y-1">
                  {decision.reopenConditions.map((cond: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-gray-400 mt-0.5">→</span>
                      <span className="text-gray-700">{cond}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Actions */}
            {decision.nextActions?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Next Actions</p>
                <ul className="space-y-1">
                  {decision.nextActions.map((action: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-blue-500 mt-0.5">▶</span>
                      <span className="text-blue-900">{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DecisionsPage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading } = useProject(projectId);
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) return <div className="p-8">Loading decisions...</div>;
  if (projectData?.error) {
    return (
      <div className="p-8">
        <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
        <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">⚠</div>
          <h2 className="text-lg font-bold text-red-700 mb-2">Failed to load decisions</h2>
          <p className="text-red-600 text-sm">The API may be unavailable or the project does not exist.</p>
        </div>
      </div>
    );
  }

  const decisions = projectData?.data?.project?.decisions || [];
  const versions = projectData?.data?.project?.ideaVersions || [];
  const [decisionPage, setDecisionPage] = useState(1);
  const DECISION_PAGE_SIZE = 10;
  const decisionTotalPages = Math.ceil(decisions.length / DECISION_PAGE_SIZE);
  const paginatedDecisions = decisions.slice((decisionPage - 1) * DECISION_PAGE_SIZE, decisionPage * DECISION_PAGE_SIZE);

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold">Decision Ledger</h1>
        </div>
        <button onClick={() => setIsOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">Record Decision</button>
      </header>

      {isOpen && <RecordDecisionModal projectId={projectId} versions={versions} onClose={() => setIsOpen(false)} />}

      <div className="grid gap-6">
        {decisions.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
            <div className="text-4xl mb-4">⚖️</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">No decisions recorded</h3>
            <p className="text-gray-500">Run a deliberation cycle until consensus is reached, or record a manual decision.</p>
          </div>
        ) : (
          paginatedDecisions.map((d: any) => (
            <DecisionDetailCard key={d.id} decision={d} />
          ))
        )}
      </div>
      <Pagination currentPage={decisionPage} totalPages={decisionTotalPages} onPageChange={setDecisionPage} />
    </div>
  );
}
