'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEvidence, useClaims, useSearchEvidence, useSearchCounterEvidence, useAssessEvidence, useModels, useEvidenceQuality, useStaleEvidence, useVerifyEvidence } from "@/hooks/useApi";
import { useState } from "react";
import FeedbackButton from "@/components/FeedbackButton";
import Pagination from "@/components/Pagination";
import QualityDashboard from "@/components/QualityDashboard";

function AssessModal({ evidenceId, onClose }: { evidenceId: string; onClose: () => void }) {
  const { data: modelsData } = useModels();
  const assessEvidence = useAssessEvidence();
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  const models = modelsData?.data || [];

  const handleAssess = async () => {
    if (selectedModelIds.length === 0) return;
    await assessEvidence.mutateAsync({ evidenceId, modelIds: selectedModelIds });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Assess Evidence</h2>
          <p className="text-xs text-gray-500 mt-1">Select models to evaluate this source</p>
        </header>
        <div className="p-6 space-y-3">
          {models.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No models configured. Add models in Settings.</p>
          ) : (
            models.map((m: any) => (
              <label key={m.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100">
                <input type="checkbox" checked={selectedModelIds.includes(m.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedModelIds(prev => [...prev, m.id]);
                    else setSelectedModelIds(prev => prev.filter(id => id !== m.id));
                  }}
                  className="rounded border-gray-300"
                />
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.provider} &bull; {m.model}</p>
                </div>
              </label>
            ))
          )}
          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAssess} disabled={selectedModelIds.length === 0 || assessEvidence.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {assessEvidence.isPending ? 'Assessing...' : `Assess with ${selectedModelIds.length} model${selectedModelIds.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceDetailPanel({ projectId, evidence, onClose }: { projectId: string; evidence: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between sticky top-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-800">Evidence Detail</h2>
            <FeedbackButton projectId={projectId} targetType="evidence" targetId={evidence.id} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </header>
        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Title</p>
            <p className="text-sm font-medium">{evidence.title || 'Untitled'}</p>
          </div>
          {evidence.sourceUrl && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">URL</p>
              <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline break-all">{evidence.sourceUrl}</a>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Source Type</p>
              <p className="text-sm capitalize">{evidence.sourceType?.replace(/_/g, ' ') || 'unknown'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Publisher</p>
              <p className="text-sm">{evidence.publisher || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Reliability</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                evidence.reliability === 'high' ? 'bg-green-100 text-green-800' :
                evidence.reliability === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                evidence.reliability === 'low' ? 'bg-orange-100 text-orange-800' :
                'bg-gray-100 text-gray-800'
              }`}>{evidence.reliability}</span>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Relevance</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                evidence.relevance === 'direct' ? 'bg-green-100 text-green-800' :
                evidence.relevance === 'indirect' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>{evidence.relevance}</span>
            </div>
          </div>
          {evidence.excerpt && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Excerpt</p>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border">{evidence.excerpt}</p>
            </div>
          )}
          {evidence.summary && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Summary</p>
              <p className="text-sm text-gray-700">{evidence.summary}</p>
            </div>
          )}
          {evidence.stalenessRisk && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Staleness Risk</p>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                evidence.stalenessRisk === 'low' ? 'bg-green-100 text-green-800' :
                evidence.stalenessRisk === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>{evidence.stalenessRisk}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-400">
            <p>Retrieved: {evidence.retrievedAt ? new Date(evidence.retrievedAt).toLocaleDateString() : '—'}</p>
            {evidence.publishedAt && <p>Published: {new Date(evidence.publishedAt).toLocaleDateString()}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EvidencePage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: evidenceData, isLoading } = useEvidence(projectId);
  const { data: claimsData } = useClaims(projectId);
  const { data: qualityData } = useEvidenceQuality(projectId);
  const { data: staleData } = useStaleEvidence(projectId);
  const verifyEvidence = useVerifyEvidence();
  const [assessingEvidenceId, setAssessingEvidenceId] = useState<string | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'quality' | 'stale'>('list');

  // Search state
  const [searchClaimId, setSearchClaimId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'supporting' | 'counter'>('supporting');
  const searchEvidence = useSearchEvidence(searchClaimId);
  const searchCounterEvidence = useSearchCounterEvidence(searchClaimId);
  const searchMut = searchMode === 'supporting' ? searchEvidence : searchCounterEvidence;

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterReliability, setFilterReliability] = useState<string>('');
  const [filterSourceType, setFilterSourceType] = useState<string>('');
  const [evidencePage, setEvidencePage] = useState(1);
  const EVIDENCE_PAGE_SIZE = 20;
  const claims = claimsData?.data || [];
  const allEvidence = evidenceData?.data || [];

  // Apply filters
  const filteredEvidence = allEvidence.filter((e: any) => {
    if (filterStatus && e.status !== filterStatus) return false;
    if (filterReliability && e.reliability !== filterReliability) return false;
    if (filterSourceType && e.sourceType !== filterSourceType) return false;
    return true;
  });

  const evidenceTotalPages = Math.ceil(filteredEvidence.length / EVIDENCE_PAGE_SIZE);
  const paginatedEvidence = filteredEvidence.slice((evidencePage - 1) * EVIDENCE_PAGE_SIZE, evidencePage * EVIDENCE_PAGE_SIZE);

  if (isLoading) return <div className="p-8">Loading evidence...</div>;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-4">
        <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
        <h1 className="text-2xl font-bold">Evidence Commons</h1>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button onClick={() => setActiveTab('list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'list' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Evidence List
        </button>
        <button onClick={() => setActiveTab('quality')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'quality' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Quality Dashboard
        </button>
        <button onClick={() => setActiveTab('stale')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'stale' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Stale Evidence {staleData?.data?.staleCount ? `(${staleData.data.staleCount})` : ''}
        </button>
      </div>

      {activeTab === 'quality' && qualityData?.data ? (
        <QualityDashboard data={qualityData.data} />
      ) : activeTab === 'quality' ? (
        <div className="text-center py-8 text-gray-400">Loading quality data...</div>
      ) : null}

      {activeTab === 'stale' && (
        <div className="mt-4">
          {staleData?.data ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  {staleData.data.staleCount} of {staleData.data.totalCount} evidence items are stale
                  (threshold: {staleData.data.thresholdDays} days)
                </p>
              </div>
              {staleData.data.stale.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No stale evidence found</div>
              ) : (
                <div className="space-y-3">
                  {staleData.data.stale.map((e: any) => (
                    <div key={e.id} className="border rounded-lg p-4 bg-amber-50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{e.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{e.sourceUrl.substring(0, 60)}...</a>}
                          {e.publishedAt && <span className="ml-2">Published: {new Date(e.publishedAt).toLocaleDateString()}</span>}
                        </div>
                        <div className="text-xs text-amber-600 mt-1">Risk: {e.stalenessRisk}</div>
                      </div>
                      <button
                        onClick={() => verifyEvidence.mutate(e.id)}
                        disabled={verifyEvidence.isPending}
                        className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        {verifyEvidence.isPending ? 'Verifying...' : 'Mark Verified'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">Loading stale evidence...</div>
          )}
        </div>
      )}

      {activeTab === 'list' && (<>
      {/* Search Evidence Section */}
      <div className="bg-white border rounded-lg p-5 space-y-4">
        <h2 className="font-semibold text-sm text-gray-700">Search for Evidence</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <select value={searchClaimId} onChange={e => setSearchClaimId(e.target.value)}
            className="border rounded px-3 py-2 text-sm bg-white min-w-[180px]">
            <option value="">Select a claim...</option>
            {claims.map((c: any) => (
              <option key={c.id} value={c.id}>{c.text.substring(0, 60)}...</option>
            ))}
          </select>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search query (defaults to claim text)..."
            className="flex-1 border rounded px-3 py-2 text-sm min-w-0" />
          <div className="flex gap-2">
            <button onClick={() => setSearchMode('supporting')}
              className={`px-4 py-2 rounded text-sm font-medium border ${searchMode === 'supporting' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-gray-500'}`}>
              Supporting
            </button>
            <button onClick={() => setSearchMode('counter')}
              className={`px-4 py-2 rounded text-sm font-medium border ${searchMode === 'counter' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-500'}`}>
              Counter
            </button>
          </div>
          <button onClick={() => {
            if (searchClaimId) {
              const query = searchQuery.trim() || claims.find((c: any) => c.id === searchClaimId)?.text || '';
              if (query) searchMut.mutate(query);
            }
          }} disabled={!searchClaimId || searchMut.isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
            {searchMut.isPending ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchMut.data?.data && (
          <p className="text-xs text-green-600">Found {searchMut.data.data.length} evidence item{searchMut.data.data.length !== 1 ? 's' : ''}.</p>
        )}
      </div>

      {/* Filters */}
      {allEvidence.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded px-3 py-1.5 text-xs bg-white">
            <option value="">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="accepted">Accepted</option>
            <option value="accepted_with_caution">Accepted w/ Caution</option>
            <option value="rejected">Rejected</option>
            <option value="irrelevant">Irrelevant</option>
          </select>
          <select value={filterReliability} onChange={e => setFilterReliability(e.target.value)}
            className="border rounded px-3 py-1.5 text-xs bg-white">
            <option value="">All Reliability</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={filterSourceType} onChange={e => setFilterSourceType(e.target.value)}
            className="border rounded px-3 py-1.5 text-xs bg-white">
            <option value="">All Sources</option>
            <option value="academic">Academic</option>
            <option value="official">Official</option>
            <option value="government">Government</option>
            <option value="company">Company</option>
            <option value="news">News</option>
            <option value="blog">Blog</option>
            <option value="forum">Forum</option>
            <option value="benchmark">Benchmark</option>
            <option value="user_input">User Input</option>
            <option value="unknown">Unknown</option>
          </select>
          {(filterStatus || filterReliability || filterSourceType) && (
            <button onClick={() => { setFilterStatus(''); setFilterReliability(''); setFilterSourceType(''); }}
              className="text-xs text-red-500 hover:underline">Clear filters</button>
          )}
        </div>
      )}

      {/* Evidence Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reliability</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Relevance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {              filteredEvidence.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-400 italic">
                  {allEvidence.length === 0
                    ? 'No evidence collected yet. Use the search panel above or start a deliberation run to discover evidence.'
                    : 'No evidence matches the current filters.'
                  }
                </td>
              </tr>
            ) : (
              paginatedEvidence.map((item: any) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 max-w-[200px]">
                    <button onClick={() => setViewingEvidence(item)}
                      className="text-blue-600 hover:underline text-left block max-w-full truncate">
                      {item.title || item.sourceUrl || 'Untitled'}
                    </button>
                    {item.publisher && <p className="text-[10px] text-gray-400 mt-0.5">{item.publisher}</p>}
                    {item.isCounter && (
                      <span className="inline-block mt-1 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded uppercase">Counter</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 capitalize">
                    {item.sourceType?.replace(/_/g, ' ') || 'unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.reliability === 'high' ? 'bg-green-100 text-green-800' :
                      item.reliability === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      item.reliability === 'low' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{item.reliability}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.relevance === 'direct' ? 'bg-green-100 text-green-800' :
                      item.relevance === 'indirect' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{item.relevance}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      item.status === 'accepted' ? 'bg-green-100 text-green-800' :
                      item.status === 'accepted_with_caution' ? 'bg-yellow-100 text-yellow-800' :
                      item.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      item.status === 'irrelevant' ? 'bg-gray-100 text-gray-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>{item.status?.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap space-x-2">
                    <button onClick={() => setViewingEvidence(item)}
                      className="text-xs text-gray-500 hover:text-gray-700 border px-2 py-1 rounded">View</button>
                    <button onClick={() => setAssessingEvidenceId(item.id)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors">Assess</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {filteredEvidence.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-400">
            Showing {filteredEvidence.length} of {allEvidence.length} evidence items
          </div>
        )}
      </div>
      <Pagination currentPage={evidencePage} totalPages={evidenceTotalPages} onPageChange={setEvidencePage} />
      </>)}

      {/* Assess Modal */}
      {assessingEvidenceId && <AssessModal evidenceId={assessingEvidenceId} onClose={() => setAssessingEvidenceId(null)} />}

      {/* Detail Panel Modal */}
      {viewingEvidence && <EvidenceDetailPanel projectId={projectId} evidence={viewingEvidence} onClose={() => setViewingEvidence(null)} />}
    </div>
  );
}
