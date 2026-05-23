import React from 'react';

interface Badge { badge_type: string; earned_at: string; }
interface Props { earned: Badge[]; }

const ALL_BADGES = [
  { type: 'first_run', label: 'First Run', icon: '🏃' },
  { type: '5k',        label: '5K',        icon: '5️⃣' },
  { type: '10k',       label: '10K',       icon: '🔟' },
  { type: '21k',       label: 'Half Marathon', icon: '🥈' },
  { type: '42k',       label: 'Marathon',  icon: '🏅' },
  { type: 'longest_streak', label: '7-Day Streak', icon: '🔥' },
];

export default function BadgeList({ earned }: Props) {
  const earnedSet = new Set(earned.map(b => b.badge_type));
  const earnedMap = Object.fromEntries(earned.map(b => [b.badge_type, b.earned_at]));

  return (
    <div className="badge-section">
      <h3 className="section-title">Badges</h3>
      <div className="badge-grid">
        {ALL_BADGES.map(b => {
          const isEarned = earnedSet.has(b.type);
          return (
            <div key={b.type} className={`badge-item ${isEarned ? 'earned' : 'locked'}`}>
              <span className="badge-icon">{b.icon}</span>
              <span className="badge-label">{b.label}</span>
              {isEarned && (
                <span className="badge-date">
                  {new Date(earnedMap[b.type]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
