import React from 'react';

export type WeatherIconKey = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';

interface Props {
  icon: WeatherIconKey;
  size?: number;
}

// Weather-condition accent colors are content signifiers (like the route
// start/end markers in RouteMap.tsx), not UI chrome, so they're
// intentionally outside the --* design-token palette.
const ACCENTS: Record<WeatherIconKey, string> = {
  clear: '#F5A623',
  cloudy: '#8A8A8E',
  rain: '#7FB3D5',
  snow: '#D6E4F0',
  storm: '#F5A623',
};

export default function WeatherIcon({ icon, size = 16 }: Props) {
  const color = ACCENTS[icon] || ACCENTS.cloudy;

  if (icon === 'clear') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.6" />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'rain') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M7 16a4 4 0 0 1 .5-7.97A5.5 5.5 0 0 1 18 10a3.5 3.5 0 0 1-.5 6.9" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === 'snow') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M7 16a4 4 0 0 1 .5-7.97A5.5 5.5 0 0 1 18 10a3.5 3.5 0 0 1-.5 6.9" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M9 19v3M13 19v3M17 19v3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.5 2.5" />
      </svg>
    );
  }
  if (icon === 'storm') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M7 14a4 4 0 0 1 .5-7.97A5.5 5.5 0 0 1 18 8a3.5 3.5 0 0 1-.5 6.9" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M13 14l-3 5h3l-2 4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // cloudy (also the fallback for unrecognized keys)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 17a4 4 0 0 1 .5-7.97A5.5 5.5 0 0 1 18 11a3.5 3.5 0 0 1-.5 6.9" stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
