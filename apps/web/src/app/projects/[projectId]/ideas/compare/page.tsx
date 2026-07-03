'use client';

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useProject, useCompareVersions } from "@/hooks/useApi";
import { useState } from "react";

export default function ComparePage() {
  const { projectId } = useParams() as { projectId: string };
  const searchParams = useSearchParams();
  const { data: projectData } = useProject(projectId);
  const [v1, setV1] = useState(searchParams.get('v1') || '');
  const [v2, setV2] = useState(searchParams.get('v2') || '');

  const { data: compareData, isLoading } = useCompareVersions(v1, v2);
  const versions = projectData?.data?.project?.ideaVersions || [];
  const result = compareData?.data as any;

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center gap-4">
        <Link href={`/projects/${projectId}/ideas`} className="text-blue-600 hover:underline text-sm">← Idea Evolution</Link>
        <h1 className="text-2xl font-bold">Compare Versions</h1>
      </header>

      {/* Version selectors */}
      <div className="bg-white border rounded-lg p-5 flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Version A</label>
          <select value={v1} onChange={e => setV1(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-white">
            <option value="">Select version...</option>
            {versions.map((v: any) => (
              <option key={v.id} value={v.id}>v{v.versionNumber} - {v.title}</option>
            ))}
          </select>
        </div>
        <div className="text-gray-400 font-bold">vs</div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Version B</label>
          <select value={v2} onChange={e => setV2(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-white">
            <option value="">Select version...</option>
            {versions.map((v: any) => (
              <option key={v.id} value={v.id}>v{v.versionNumber} - {v.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {isLoading && v1 && v2 ? (
        <div className="text-center py-8 text-gray-400">Loading comparison...</div>
      ) : result ? (
        <div className="space-y-6">
          {/* Version headers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs font-bold text-gray-500 uppercase">Version A</p>
              <p className="font-bold mt-1">{result.version1.title}</p>
              <p className="text-sm text-gray-500">v{result.version1.versionNumber} · {result.version1.status}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs font-bold text-gray-500 uppercase">Version B</p>
              <p className="font-bold mt-1">{result.version2.title}</p>
              <p className="text-sm text-gray-500">v{result.version2.versionNumber} · {result.version2.status}</p>
            </div>
          </div>

          {/* Description diff */}
          {result.descriptionChanged && (
            <div className="bg-white border rounded-lg p-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-3">Description Changed</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-xs font-bold text-red-600 mb-1">A</p>
                  <p className="text-gray-700">{result.version1.description}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-xs font-bold text-green-600 mb-1">B</p>
                  <p className="text-gray-700">{result.version2.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Claims comparison */}
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs font-bold text-gray-500 uppercase mb-3">
              Claims ({result.claims.totalV1} → {result.claims.totalV2})
            </p>

            {result.claims.added.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-green-600 mb-2">+ Added ({result.claims.added.length})</p>
                {result.claims.added.map((c: any) => (
                  <div key={c.id} className="bg-green-50 border border-green-200 rounded p-2 mb-1 text-sm">
                    {c.text}
                  </div>
                ))}
              </div>
            )}

            {result.claims.removed.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-red-600 mb-2">- Removed ({result.claims.removed.length})</p>
                {result.claims.removed.map((c: any) => (
                  <div key={c.id} className="bg-red-50 border border-red-200 rounded p-2 mb-1 text-sm line-through">
                    {c.text}
                  </div>
                ))}
              </div>
            )}

            {result.claims.kept.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">= Kept ({result.claims.kept.length})</p>
                {result.claims.kept.map((c: any) => (
                  <div key={c.id} className="bg-gray-50 border border-gray-200 rounded p-2 mb-1 text-sm text-gray-600">
                    {c.text}
                  </div>
                ))}
              </div>
            )}

            {result.claims.added.length === 0 && result.claims.removed.length === 0 && (
              <p className="text-sm text-gray-400">No changes in claims</p>
            )}
          </div>
        </div>
      ) : v1 && v2 ? (
        <div className="text-center py-8 text-gray-400">Select two versions to compare</div>
      ) : (
        <div className="text-center py-8 text-gray-400">Select two versions above to compare</div>
      )}
    </div>
  );
}
