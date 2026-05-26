import React from 'react';

interface Badge { badge_type: string; earned_at: string; }
interface Props { earned: Badge[]; }

const ALL_BADGES = [
  { type: 'first_run',      label: 'First Run', glyph: '◐' },
  { type: '5k',             label: '5K',        glyph: '5'  },
  { type: '10k',            label: '10K',       glyph: '10' },
  { type: '21k',            label: 'Half',      glyph: '21' },
  { type: '42k',            label: 'Marathon',  glyph: '42' },
  { type: 'longest_streak', label: '7-day',     glyph: '🔥' },
];

export default function BadgeList({ earned }: Props) {
  const earnedSet = new Set(earned.map(b => b.badge_type));
  const earnedMap = Object.fromEntries(earned.map(b => [b.badge_type, b.earned_at]));
  const earnedCount = ALL_BADGES.filter(b => earnedSet.has(b.type)).length;

  return (
    <div>
      <div className="section-header">Badges · {earnedCount} of {ALL_BADGES.length}</div>
      <div className="badge-section">
        <div className="badge-grid">
          {ALL_BADGES.map(b => {
            const isEarned = earnedSet.has(b.type);
            return (
              <div key={b.type} className={`badge-item ${isEarned ? '' : 'locked'}`}>
                <div className={`badge-icon-box ${isEarned ? 'earned' : 'locked-box'}`}>
                  {b.glyph}
                </div>
                <div className="badge-label">{b.label}</div>
                {isEarned && earnedMap[b.type] && (
                  <div className="badge-date">
                    {new Date(earnedMap[b.type]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
