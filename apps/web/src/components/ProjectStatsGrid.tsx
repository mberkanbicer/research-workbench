interface ProjectStatsGridProps {
  claimsCount: number;
  evidenceCount: number;
  latestDecisionLabel: string;
  ideaStatus: string;
}

export default function ProjectStatsGrid({
  claimsCount,
  evidenceCount,
  latestDecisionLabel,
  ideaStatus,
}: ProjectStatsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-3xl">
        <p className="text-xs font-extrabold text-blue-400 uppercase tracking-widest mb-1">Claims</p>
        <p className="text-4xl font-black text-blue-700">{claimsCount}</p>
      </div>
      <div className="bg-green-50/50 border border-green-100 p-6 rounded-3xl">
        <p className="text-xs font-extrabold text-green-400 uppercase tracking-widest mb-1">Evidence</p>
        <p className="text-4xl font-black text-green-700">{evidenceCount}</p>
      </div>
      <div className="bg-purple-50/50 border border-purple-100 p-6 rounded-3xl">
        <p className="text-xs font-extrabold text-purple-400 uppercase tracking-widest mb-1">Latest Decision</p>
        <p className="text-2xl md:text-3xl font-black text-purple-700 capitalize break-words">{latestDecisionLabel}</p>
      </div>
      <div className="bg-yellow-50/50 border border-yellow-100 p-6 rounded-3xl">
        <p className="text-xs font-extrabold text-yellow-400 uppercase tracking-widest mb-1">Idea Status</p>
        <p className="text-2xl md:text-3xl font-black text-yellow-700 capitalize break-words">{ideaStatus}</p>
      </div>
    </div>
  );
}
