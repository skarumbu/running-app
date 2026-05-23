import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Run } from './HistoryTab';

interface Props { runs: Run[]; }

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DistanceChart({ runs }: Props) {
  const data = useMemo(() => {
    const weekMap: Record<string, number> = {};
    runs.forEach(r => {
      const week = getWeekLabel(r.started_at);
      weekMap[week] = (weekMap[week] || 0) + r.distance_meters / 1000;
    });
    return Object.entries(weekMap)
      .slice(-8)
      .map(([week, km]) => ({ week, km: parseFloat(km.toFixed(1)) }));
  }, [runs]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">Weekly distance (km)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${v} km`, 'Distance']} />
          <Bar dataKey="km" fill="#1a5c52" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
