'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface ConfidencePoint {
  round: number;
  confidence: number;
  reason?: string;
  createdAt: string;
}

export default function ConfidenceChart({ history }: { history: ConfidencePoint[] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No confidence data yet</p>;
  }

  const data = history.map(h => ({
    round: h.round,
    confidence: h.confidence,
    reason: h.reason || '',
    date: new Date(h.createdAt).toLocaleDateString(),
  }));

  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <XAxis dataKey="round" tick={{ fontSize: 10 }} label={{ value: 'Round', position: 'bottom', fontSize: 10 }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
          <Tooltip
            formatter={(value: any) => [`${((value || 0) * 100).toFixed(0)}%`, 'Confidence']}
            labelFormatter={(label: any) => `Round ${label}`}
          />
          <ReferenceLine y={0.5} stroke="#e5e7eb" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="confidence" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
