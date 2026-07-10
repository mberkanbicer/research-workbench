'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface TrendData {
  period: string;
  claimCount: number;
  evidenceCount: number;
  critiqueCount: number;
  decisionCount: number;
  avgConfidence: number;
}

interface PredictionResult {
  claimId: string;
  claimText: string;
  currentConfidence: number;
  predictedOutcome: 'supported' | 'contradicted' | 'inconclusive';
  confidence: number;
  factors: string[];
  timeToResolution: number;
}

interface ResearchInsights {
  trends: TrendData[];
  predictions: PredictionResult[];
  recommendations: string[];
}

const COLORS = ['#3fb950', '#f85149', '#d29922', '#58a6ff'];

export default function AnalyticsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [timeRange, setTimeRange] = useState(30);

  const { data: insights, isLoading } = useQuery({
    queryKey: ['analytics', projectId, timeRange],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/analytics/insights?days=${timeRange}`);
      const json = await res.json();
      return json.data as ResearchInsights;
    },
  });

  if (isLoading) {
    return <div className="p-8">Loading analytics...</div>;
  }

  const trends = insights?.trends || [];
  const predictions = insights?.predictions || [];
  const recommendations = insights?.recommendations || [];

  // Prepare chart data
  const trendChartData = trends.map(t => ({
    date: t.period.split('T')[0],
    Claims: t.claimCount,
    Evidence: t.evidenceCount,
    Critiques: t.critiqueCount,
  }));

  const predictionDistribution = predictions.reduce((acc, p) => {
    acc[p.predictedOutcome] = (acc[p.predictedOutcome] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(predictionDistribution).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Research Analytics</h1>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="border rounded-lg px-3 py-2"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Research Activity Trends</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Claims" stroke="#3fb950" strokeWidth={2} />
              <Line type="monotone" dataKey="Evidence" stroke="#58a6ff" strokeWidth={2} />
              <Line type="monotone" dataKey="Critiques" stroke="#d29922" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prediction Distribution */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Claim Outcome Predictions</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">Research Recommendations</h2>
          {recommendations.length > 0 ? (
            <ul className="space-y-3">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No recommendations at this time. Keep up the great research!</p>
          )}
        </div>
      </div>

      {/* Predictions Table */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Claim Predictions ({predictions.length})</h2>
        {predictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Claim</th>
                  <th className="text-left py-2">Current Confidence</th>
                  <th className="text-left py-2">Predicted Outcome</th>
                  <th className="text-left py-2">Prediction Confidence</th>
                  <th className="text-left py-2">Key Factors</th>
                </tr>
              </thead>
              <tbody>
                {predictions.slice(0, 10).map((pred) => (
                  <tr key={pred.claimId} className="border-b hover:bg-gray-50">
                    <td className="py-2 max-w-xs truncate">{pred.claimText}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${pred.currentConfidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs">{(pred.currentConfidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        pred.predictedOutcome === 'supported' ? 'bg-green-100 text-green-800' :
                        pred.predictedOutcome === 'contradicted' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {pred.predictedOutcome}
                      </span>
                    </td>
                    <td className="py-2">{(pred.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2 text-xs text-gray-500">{pred.factors.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No pending claims to predict.</p>
        )}
      </div>
    </div>
  );
}
