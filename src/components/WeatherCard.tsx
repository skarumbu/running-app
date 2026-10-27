import React from 'react';
import WeatherIcon from './WeatherIcon';
import { accentVar, onAccentVar, AccentKey } from '../lib/feel';
import type { WeatherSummary } from '../lib/runTypes';
import './components.css';

interface Props {
  weather: WeatherSummary;
  accent?: AccentKey;
  /** Extra words after the condition, e.g. how the weather felt. */
  extra?: string;
  compact?: boolean;
}

export default function WeatherCard({ weather, accent = 'a3', extra, compact = false }: Props) {
  return (
    <div
      className={`wx${compact ? ' compact' : ''}`}
      style={{ background: accentVar(accent), color: onAccentVar(accent) }}
    >
      <span className="wx-icon"><WeatherIcon icon={weather.icon} size={compact ? 36 : 44} /></span>
      <div>
        <div className="wx-temp">{weather.temp_f}&deg;</div>
        <span className="wx-words">{[weather.condition, extra].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  );
}
