import React, { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import BadgeList from './BadgeList';
import './profile.css';

interface Badge { badge_type: string; earned_at: string; run_id: string; }
interface Bests {
  total_runs: number;
  total_km: number;
  best_pace_seconds_per_km: number | null;
  longest_run_meters: number | null;
}

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

export default function ProfileTab() {
  const { user, apiFetch, signOut } = useAuth();
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

  const displayName = user?.displayName || user?.email || 'Runner';

  return (
    <div className="profile-tab">
      <div className="profile-topbar">
        <div>
          <div className="profile-label">Runner</div>
          <div className="profile-name">{displayName.split(' ')[0]}{displayName.includes(' ') ? ' ' + displayName.split(' ').slice(1).join(' ') : ''}</div>
          <div className="profile-since">{user?.email}</div>
        </div>
        <button className="profile-settings-btn" onClick={signOut} title="Sign out">
          <SettingsIcon />
        </button>
      </div>

      {!loading && bests && (
        <div className="totals-strip">
          <div className="total-stat">
            <div className="total-stat-value">{bests.total_runs}</div>
            <div className="total-stat-label">Runs</div>
          </div>
          <div className="total-stat">
            <div className="total-stat-value">{bests.total_km.toFixed(0)}</div>
            <div className="total-stat-label">Total km</div>
          </div>
          <div className="total-stat">
            <div className="total-stat-value">{bests.longest_run_meters ? (bests.longest_run_meters / 1000).toFixed(1) : '--'}</div>
            <div className="total-stat-label">Longest</div>
          </div>
        </div>
      )}

      {!loading && bests && (
        <div>
          <div className="section-header">Personal bests</div>
          <div className="bests-grid">
            <div className="best-card">
              <div className="best-label">Best pace</div>
              <div className="best-value">{formatPace(bests.best_pace_seconds_per_km)}</div>
            </div>
            <div className="best-card">
              <div className="best-label">Longest run</div>
              <div className="best-value">{bests.longest_run_meters ? `${(bests.longest_run_meters / 1000).toFixed(1)} km` : '--'}</div>
            </div>
          </div>
        </div>
      )}

      <BadgeList earned={badges} />
    </div>
  );
}
