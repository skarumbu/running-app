import React from 'react';
import type { WeatherIconKey } from '../lib/runTypes';

interface Props {
  icon: WeatherIconKey;
  size?: number;
}

// Drawn in currentColor so the icon takes the colour of the card or tag it
// sits in.
export default function WeatherIcon({ icon, size = 16 }: Props) {
  if (icon === 'clear') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="5" fill="currentColor" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'rain') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15a5 5 0 1 1 9.6-2H17a3 3 0 0 1 0 6H7a3 3 0 0 1 0-4Z" transform="translate(0 -2)" fill="currentColor" />
        <path d="M9 22l1-2M13 22l1-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'snow') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15a5 5 0 1 1 9.6-2H17a3 3 0 0 1 0 6H7a3 3 0 0 1 0-4Z" transform="translate(0 -2)" fill="currentColor" />
        <path d="M9 21.5h.01M13 21.5h.01M17 21.5h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'storm') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15a5 5 0 1 1 9.6-2H17a3 3 0 0 1 0 6H7a3 3 0 0 1 0-4Z" transform="translate(0 -3)" fill="currentColor" />
        <path d="M13 16l-3 4h3l-2 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  // cloudy (also the fallback for unrecognized keys)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18a5 5 0 1 1 9.6-2H17a3 3 0 0 1 0 6H7a3 3 0 0 1 0-4Z" transform="translate(0 -3)" fill="currentColor" />
    </svg>
  );
}
