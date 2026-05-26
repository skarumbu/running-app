import React, { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import BadgeList from './BadgeList';
import './profile.css';

interface Badge {
  badge_type: string;
  earned_at: string;
  run_id: string;
}

interface Bests {
  total_runs: number;
  total_km: number;
  best_pace_seconds_per_km: number | null;
  longest_run_meters: number | null;
}

export default function ProfileTab() {
  const { user, apiFetch } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [bests, setBests] = useState<Bests | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/badges').then(r => r.json()),
      apiFetch('/api/runs/bests').then(r => r.json()),
    ])
      .then(([b, s]) => { setBadges(b); setBests(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiFetch]);

  function formatPace(secs: number | null): string {
    if (!secs) return '--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')} /km`;
  }

  return (
    <div className="profile-tab">
      <div className="profile-header">
        <span className="profile-name">{user?.displayName || user?.email || 'Runner'}</span>
      </div>

      {!loading && bests && (
        <div className="bests-grid">
          <div className="best-card">
            <span className="best-value">{bests.total_runs}</span>
            <span className="best-label">Runs</span>
          </div>
          <div className="best-card">
            <span className="best-value">{(bests.total_km).toFixed(0)}</span>
            <span className="best-label">Total km</span>
          </div>
          <div className="best-card">
            <span className="best-value">{formatPace(bests.best_pace_seconds_per_km)}</span>
            <span className="best-label">Best pace</span>
          </div>
          <div className="best-card">
            <span className="best-value">
              {bests.longest_run_meters ? `${(bests.longest_run_meters / 1000).toFixed(1)} km` : '--'}
            </span>
            <span className="best-label">Longest run</span>
          </div>
        </div>
      )}

      <BadgeList earned={badges} />
    </div>
  );
}
