'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useClaimDetail, useUpdateClaim } from '@/hooks/useApi';
import { useInspectorStore } from '@/store/inspectorStore';
import ConfidenceChart from '@/components/ConfidenceChart';
import { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  supported: 'bg-green-100 text-green-800 border-green-200',
  contradicted: 'bg-red-100 text-red-800 border-red-200',
  unverified: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  partially_supported: 'bg-blue-100 text-blue-800 border-blue-200',
  unsupported: 'bg-orange-100 text-orange-800 border-orange-200',
  needs_external_validation: 'bg-purple-100 text-purple-800 border-purple-200',
};

const STATUS_ICONS: Record<string, string> = {
  supported: '\u2705',
  contradicted: '\u274C',
  unverified: '\u2753',
  partially_supported: '\u26A0\uFE0F',
  unsupported: '\u274C',
  needs_external_validation: '\uD83D\uDD0D',
};

type Tab = 'evidence' | 'critiques' | 'reviews' | 'history' | 'related';

export default function ClaimDetailPage() {
  const { projectId, claimId } = useParams() as { projectId: string; claimId: string };
  const { data, isLoading } = useClaimDetail(projectId, claimId);
  const updateClaim = useUpdateClaim();
  const openInspector = useInspectorStore((s) => s.openInspector);
  const [activeTab, setActiveTab] = useState<Tab>('evidence');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading claim detail...</p>
        </div>
      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center text-gray-500">
        Claim not found.
        <Link href={`/projects/${projectId}`} className="block mt-4 text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const detail = data.data as any;
  const {
    claim,
    evidence,
    critiques,
    critiqueResponses,
    reviews,
    confidenceHistory,
    dependencies,
    relatedClaims,
  } = detail;

  // Link critiques to their responses
  const critiquesWithResponses = critiques.map((c: any) => ({
    ...c,
    responses: critiqueResponses.filter((r: any) => r.critiqueId === c.id),
  }));

  // Filter reviews that mention this claim
  const relevantReviews = reviews.filter(
    (r: any) =>
      r.strengths?.some((s: string) =>
        s.toLowerCase().includes(claim.text.substring(0, 30).toLowerCase()),
      ) ||
      r.weaknesses?.some((w: string) =>
        w.toLowerCase().includes(claim.text.substring(0, 30).toLowerCase()),
      ),
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'evidence', label: 'Evidence', count: evidence.length },
    { id: 'critiques', label: 'Critiques', count: critiques.length },
    { id: 'reviews', label: 'Reviews', count: relevantReviews.length },
    { id: 'history', label: 'Confidence History', count: confidenceHistory.length },
    { id: 'related', label: 'Related Claims', count: relatedClaims.length + dependencies.length },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/projects/${projectId}`} className="hover:text-gray-700">
          Dashboard
        </Link>
        <span>/</span>
        <Link href={`/projects/${projectId}/graph`} className="hover:text-gray-700">
          Graph
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Claim</span>
      </div>

      {/* Claim header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-500">
                Claim
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[claim.status] || STATUS_COLORS.unverified}`}
              >
                {STATUS_ICONS[claim.status] || ''} {claim.status?.replace(/_/g, ' ')}
              </span>
              {claim.criticality && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    claim.criticality === 'high'
                      ? 'bg-red-100 text-red-700'
                      : claim.criticality === 'medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {claim.criticality}
                </span>
              )}
              {claim.type && <span className="text-xs text-gray-400 uppercase">{claim.type}</span>}
            </div>
            <p className="text-lg text-gray-900 leading-relaxed">{claim.text}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {claim.confidence != null && (
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {(claim.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-400 uppercase">Confidence</div>
              </div>
            )}
            <select
              value={claim.status}
              onChange={(e) =>
                updateClaim.mutate({ claimId: claim.id, data: { status: e.target.value } })
              }
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${STATUS_COLORS[claim.status] || ''}`}
            >
              <option value="unverified">Unverified</option>
              <option value="supported">Supported</option>
              <option value="partially_supported">Partially Supported</option>
              <option value="contradicted">Contradicted</option>
              <option value="unsupported">Unsupported</option>
              <option value="needs_external_validation">Needs Validation</option>
            </select>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-6 mt-4 pt-4 border-t text-sm">
          <div>
            <span className="text-gray-500">Evidence:</span>{' '}
            <span className="font-bold">{evidence.length}</span> (
            {evidence.filter((e: any) => e.status === 'accepted').length} accepted)
          </div>
          <div>
            <span className="text-gray-500">Critiques:</span>{' '}
            <span className="font-bold">{critiques.length}</span> (
            {critiques.filter((c: any) => c.status === 'resolved').length} resolved)
          </div>
          <div>
            <span className="text-gray-500">Dependencies:</span>{' '}
            <span className="font-bold">{dependencies.length}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'evidence' && (
          <div className="space-y-3">
            {evidence.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No evidence linked to this claim yet.
              </p>
            ) : (
              evidence.map((ev: any) => (
                <div
                  key={ev.id}
                  className="bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => openInspector('evidence', ev.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900">{ev.title}</h3>
                      {ev.excerpt && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ev.excerpt}</p>
                      )}
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-500 hover:underline mt-1 block truncate"
                        >
                          {ev.sourceUrl}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      {ev.isCounter && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                          Counter
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          ev.status === 'accepted'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'critiques' && (
          <div className="space-y-4">
            {critiquesWithResponses.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No critiques on this claim yet.
              </p>
            ) : (
              critiquesWithResponses.map((crit: any) => (
                <div key={crit.id} className="bg-white rounded-lg border overflow-hidden">
                  <div className="p-4 border-l-4 border-amber-400">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          crit.severity === 'high'
                            ? 'bg-red-100 text-red-700'
                            : crit.severity === 'medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {crit.severity}
                      </span>
                      <span className="text-[10px] text-gray-400">{crit.critiqueType}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${
                          crit.status === 'resolved'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {crit.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{crit.text}</p>
                    {crit.whyItMatters && (
                      <p className="text-xs text-gray-500 mt-2">
                        <span className="font-medium">Why it matters:</span> {crit.whyItMatters}
                      </p>
                    )}
                    {crit.proposedFix && (
                      <p className="text-xs text-blue-600 mt-1">
                        <span className="font-medium">Proposed fix:</span> {crit.proposedFix}
                      </p>
                    )}
                  </div>
                  {crit.responses.length > 0 && (
                    <div className="bg-gray-50 p-3 space-y-2">
                      {crit.responses.map((resp: any) => (
                        <div key={resp.id} className="text-xs bg-white rounded p-2 border">
                          <span
                            className={`font-bold ${
                              resp.verdict === 'accept'
                                ? 'text-green-600'
                                : resp.verdict === 'rebut'
                                  ? 'text-blue-600'
                                  : 'text-gray-600'
                            }`}
                          >
                            {resp.verdict}:
                          </span>{' '}
                          {resp.rationale}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-3">
            {relevantReviews.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No model reviews reference this claim.
              </p>
            ) : (
              relevantReviews.map((rev: any) => (
                <div key={rev.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        rev.verdict === 'accept'
                          ? 'bg-green-100 text-green-700'
                          : rev.verdict === 'reject'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {rev.verdict?.replace(/_/g, ' ')}
                    </span>
                    {rev.confidence != null && (
                      <span className="text-xs text-gray-400">
                        {(rev.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                  {rev.strengths?.length > 0 && (
                    <div className="text-xs">
                      <span className="font-medium text-green-700">Strengths:</span>
                      <ul className="list-disc pl-4 text-gray-600 mt-1">
                        {rev.strengths.map((s: string, i: number) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rev.weaknesses?.length > 0 && (
                    <div className="text-xs mt-2">
                      <span className="font-medium text-red-700">Weaknesses:</span>
                      <ul className="list-disc pl-4 text-gray-600 mt-1">
                        {rev.weaknesses.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-xl border p-6">
            {confidenceHistory.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No confidence history recorded yet.
              </p>
            ) : (
              <ConfidenceChart history={confidenceHistory} />
            )}
          </div>
        )}

        {activeTab === 'related' && (
          <div className="space-y-4">
            {dependencies.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Dependencies ({dependencies.length})
                </h3>
                <div className="space-y-2">
                  {dependencies.map((dep: any) => {
                    const otherId = dep.fromClaimId === claimId ? dep.toClaimId : dep.fromClaimId;
                    const direction = dep.fromClaimId === claimId ? 'outgoing' : 'incoming';
                    const relatedClaim = relatedClaims.find((c: any) => c.id === otherId);
                    return (
                      <Link
                        key={dep.id}
                        href={`/projects/${projectId}/claims/${otherId}`}
                        className="block bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              dep.relation === 'supports'
                                ? 'bg-green-100 text-green-700'
                                : dep.relation === 'contradicts'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {dep.relation}
                          </span>
                          <span className="text-gray-400">
                            {direction === 'outgoing' ? '\u2192' : '\u2190'}
                          </span>
                          <span className="text-gray-600 truncate flex-1">
                            {relatedClaim?.text || otherId}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {relatedClaims.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Related Claims ({relatedClaims.length})
                </h3>
                <div className="space-y-2">
                  {relatedClaims.map((rc: any) => (
                    <Link
                      key={rc.id}
                      href={`/projects/${projectId}/claims/${rc.id}`}
                      className="block bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow"
                    >
                      <p className="text-sm text-gray-700">{rc.text}</p>
                      <div className="flex gap-2 mt-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[rc.status] || ''}`}
                        >
                          {rc.status}
                        </span>
                        <span className="text-[10px] text-gray-400">{rc.criticality}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {dependencies.length === 0 && relatedClaims.length === 0 && (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No related claims or dependencies.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
