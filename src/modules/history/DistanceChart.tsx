import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Run } from './HistoryTab';

interface Props { runs: Run[]; }

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
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
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fontSize: 10, fill: '#8A8A8E' }} axisLine={false} tickLine={false}/>
          <Tooltip
            formatter={(v) => [`${v} km`, 'Distance']}
            contentStyle={{ background: '#1F1F23', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, color: '#F6F4EF', fontSize: 12 }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="km" fill="#FF5A36" radius={[4, 4, 0, 0]} opacity={0.9}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
