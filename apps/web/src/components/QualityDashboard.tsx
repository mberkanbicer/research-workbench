'use client';

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface QualityData {
  total: number;
  reliabilityDistribution: Record<string, number>;
  relevanceDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  stalenessDistribution: Record<string, number>;
  sourceTypeBreakdown: Record<string, number>;
  counterEvidenceRatio: number;
  assessmentAgreement: number;
  counterCount: number;
  acceptedCount: number;
}

const COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444', '#6b7280', '#8b5cf6'];

function toPieData(dist: Record<string, number>) {
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
}

export default function QualityDashboard({ data }: { data: any }) {
  const reliabilityData = toPieData(data.reliabilityDistribution);
  const statusData = toPieData(data.statusDistribution);
  const sourceData = toPieData(data.sourceTypeBreakdown);
  const stalenessData = toPieData(data.stalenessDistribution);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{data.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total Evidence</p>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{data.acceptedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Accepted</p>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{data.counterCount}</p>
          <p className="text-xs text-gray-500 mt-1">Counter-Evidence</p>
        </div>
        <div className="bg-white border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{(data.assessmentAgreement * 100).toFixed(0)}%</p>
          <p className="text-xs text-gray-500 mt-1">Assessment Agreement</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Reliability Distribution */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Reliability Distribution</h3>
          {reliabilityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={reliabilityData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {reliabilityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">No data</p>}
        </div>

        {/* Status Distribution */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Status Distribution</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">No data</p>}
        </div>

        {/* Source Type Breakdown */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Source Types</h3>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">No data</p>}
        </div>

        {/* Staleness Risk */}
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Staleness Risk</h3>
          {stalenessData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stalenessData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-8">No data</p>}
        </div>
      </div>
    </div>
  );
}
