'use client';

import { useEffect } from 'react';
import { useInspectorStore } from '@/store/inspectorStore';
import { useParams } from 'next/navigation';
import { useClaims, useProject, useClaimConfidenceHistory } from '@/hooks/useApi';
import FeedbackButton from '@/components/FeedbackButton';
import ConfidenceChart from '@/components/ConfidenceChart';
import AnnotationsSection from '@/components/AnnotationsSection';

export default function InspectorPanel() {
  const { inspectorOpen, selectedObjectType, selectedObjectId, closeInspector } = useInspectorStore();
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading } = useProject(projectId);
  const { data: claimsData } = useClaims(projectId);

  useEffect(() => {
    if (!inspectorOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [inspectorOpen, closeInspector]);

  if (!inspectorOpen || !selectedObjectType || !selectedObjectId) return null;

  const project = projectData?.data?.project;
  const claims = claimsData?.data || [];
  const evidence = project?.evidence || [];
  const critiques = project?.critiques || [];
  const reviews = project?.modelReviews || [];
  const decisions = project?.decisions || [];
  const ideaVersions = project?.ideaVersions || [];

  let titleLabel = 'Details';
  let body: React.ReactNode = null;

  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading...</p>;
  } else if (selectedObjectType === 'claim') {
    const claim = claims.find((c: { id: string }) => c.id === selectedObjectId);
    titleLabel = 'Claim';
    body = claim ? (
      <ClaimDetail claim={claim} projectId={projectId} />
    ) : <p className="text-sm text-gray-500">Claim not found.</p>;
  } else if (selectedObjectType === 'evidence') {
    const item = evidence.find((e: { id: string }) => e.id === selectedObjectId);
    titleLabel = 'Evidence';
    body = item ? (
      <div className="space-y-2 text-sm text-gray-700">
        <p className="font-medium">{item.title}</p>
        {item.sourceUrl && <a href={item.sourceUrl} className="text-blue-600 break-all" target="_blank" rel="noreferrer">{item.sourceUrl}</a>}
        {item.excerpt && <p className="text-gray-600">{item.excerpt}</p>}
        {item.summary && <p className="text-gray-600">{item.summary}</p>}
        <p><span className="font-medium">Status:</span> {item.status}</p>
        <p><span className="font-medium">Reliability:</span> {item.reliability}</p>
        <p><span className="font-medium">Relevance:</span> {item.relevance}</p>
        <FeedbackButton projectId={projectId} targetType="evidence" targetId={item.id} />
        <AnnotationsSection projectId={projectId} entityType="evidence" entityId={item.id} />
      </div>
    ) : <p className="text-sm text-gray-500">Evidence not found.</p>;
  } else if (selectedObjectType === 'critique') {
    const item = critiques.find((c: { id: string }) => c.id === selectedObjectId);
    titleLabel = 'Critique';
    body = item ? (
      <div className="space-y-2 text-sm text-gray-700">
        <p>{item.text}</p>
        <p><span className="font-medium">Status:</span> {item.status}</p>
        <p><span className="font-medium">Severity:</span> {item.severity}</p>
        <p><span className="font-medium">Type:</span> {item.critiqueType}</p>
        {item.whyItMatters && <p className="text-gray-600"><span className="font-medium">Why it matters:</span> {item.whyItMatters}</p>}
        {item.proposedFix && <p className="text-gray-600"><span className="font-medium">Proposed fix:</span> {item.proposedFix}</p>}
        <FeedbackButton projectId={projectId} targetType="critique" targetId={item.id} />
        <AnnotationsSection projectId={projectId} entityType="critique" entityId={item.id} />
      </div>
    ) : <p className="text-sm text-gray-500">Critique not found.</p>;
  } else if (selectedObjectType === 'review') {
    const item = reviews.find((r: { id: string }) => r.id === selectedObjectId);
    titleLabel = 'Model Review';
    body = item ? (
      <div className="space-y-2 text-sm text-gray-700">
        <p><span className="font-medium">Verdict:</span> {item.verdict}</p>
        {item.confidence != null && <p><span className="font-medium">Confidence:</span> {(item.confidence * 100).toFixed(0)}%</p>}
        {Array.isArray(item.strengths) && item.strengths.length > 0 && (
          <div><span className="font-medium">Strengths:</span>
            <ul className="list-disc pl-4 text-gray-600">{item.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
        {Array.isArray(item.weaknesses) && item.weaknesses.length > 0 && (
          <div><span className="font-medium">Weaknesses:</span>
            <ul className="list-disc pl-4 text-gray-600">{item.weaknesses.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {Array.isArray(item.blockingIssues) && item.blockingIssues.length > 0 && (
          <div><span className="font-medium">Blocking Issues:</span>
            <ul className="list-disc pl-4 text-red-600">{item.blockingIssues.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
        <FeedbackButton projectId={projectId} targetType="model_review" targetId={item.id} />
      </div>
    ) : <p className="text-sm text-gray-500">Review not found.</p>;
  } else if (selectedObjectType === 'decision') {
    const item = decisions.find((d: { id: string }) => d.id === selectedObjectId);
    titleLabel = 'Decision';
    body = item ? (
      <div className="space-y-3 text-sm text-gray-700">
        <p><span className="font-medium">Status:</span> <span className="font-bold">{item.decisionStatus}</span></p>
        <p>{item.decisionText}</p>
        {Array.isArray(item.whyGood) && item.whyGood.length > 0 && (
          <div><span className="font-medium">Strengths:</span>
            <ul className="list-disc pl-4 text-green-700">{(item.whyGood as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {Array.isArray(item.whyBad) && item.whyBad.length > 0 && (
          <div><span className="font-medium">Weaknesses:</span>
            <ul className="list-disc pl-4 text-red-700">{(item.whyBad as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {Array.isArray(item.knownWeaknesses) && item.knownWeaknesses.length > 0 && (
          <div><span className="font-medium">Known Weaknesses:</span>
            <ul className="list-disc pl-4 text-orange-700">{(item.knownWeaknesses as string[]).map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {Array.isArray(item.unresolvedRisks) && item.unresolvedRisks.length > 0 && (
          <div><span className="font-medium">Unresolved Risks:</span>
            <ul className="list-disc pl-4 text-yellow-700">{(item.unresolvedRisks as string[]).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
        {Array.isArray(item.modelFinalVotes) && item.modelFinalVotes.length > 0 && (
          <div><span className="font-medium">Model Votes:</span>
            <div className="flex flex-wrap gap-1 mt-1">{(item.modelFinalVotes as any[]).map((v: any, i: number) => (
              <span key={i} className={`px-2 py-0.5 rounded text-xs font-bold ${v.vote === 'accept' ? 'bg-green-100 text-green-800' : v.vote === 'reject' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{v.modelId?.slice(0, 8)}: {v.vote}</span>
            ))}</div>
          </div>
        )}
        {Array.isArray(item.nextActions) && item.nextActions.length > 0 && (
          <div><span className="font-medium">Next Actions:</span>
            <ul className="list-disc pl-4 text-blue-700">{(item.nextActions as string[]).map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
          </div>
        )}
        <AnnotationsSection projectId={projectId} entityType="decision" entityId={item.id} />
      </div>
    ) : <p className="text-sm text-gray-500">Decision not found.</p>;
  } else if (selectedObjectType === 'idea_version') {
    const item = ideaVersions.find((v: { id: string }) => v.id === selectedObjectId);
    titleLabel = 'Idea Version';
    body = item ? (
      <div className="space-y-2 text-sm text-gray-700">
        <p><span className="font-medium">Version:</span> #{item.versionNumber}</p>
        <p><span className="font-medium">Status:</span> {item.status}</p>
        <p className="font-medium">{item.title}</p>
        <p className="text-gray-600">{item.description}</p>
      </div>
    ) : <p className="text-sm text-gray-500">Version not found.</p>;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button className="flex-1 bg-black/20" onClick={closeInspector} aria-label="Close inspector" />
      <aside className="w-full max-w-md bg-white border-l border-gray-200 shadow-xl p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{titleLabel}</h2>
          <button onClick={closeInspector} className="text-gray-500 hover:text-gray-800">Close</button>
        </div>
        {body}
      </aside>
    </div>
  );
}

function ClaimDetail({ claim, projectId }: { claim: any; projectId: string }) {
  const { data: historyData } = useClaimConfidenceHistory(projectId, claim.id);
  const history = (historyData?.data as any[]) || [];

  return (
    <div className="space-y-3 text-sm text-gray-700">
      <p>{claim.text}</p>
      <p><span className="font-medium">Status:</span> {claim.status}</p>
      <p><span className="font-medium">Type:</span> {claim.type}</p>
      <p><span className="font-medium">Criticality:</span> {claim.criticality}</p>
      {claim.confidence != null && <p><span className="font-medium">Confidence:</span> {(claim.confidence * 100).toFixed(0)}%</p>}
      {history.length > 0 && (
        <div className="pt-2">
          <p className="font-medium text-xs text-gray-500 uppercase mb-2">Confidence Over Time</p>
          <ConfidenceChart history={history} />
        </div>
      )}
      <AnnotationsSection projectId={projectId} entityType="claim" entityId={claim.id} />
    </div>
  );
}
