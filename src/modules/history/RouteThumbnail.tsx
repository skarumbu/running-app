import React from 'react';

interface Point { lat: number; lng: number; }

interface Props {
  points: Point[];
  size?: number;
}

export default function RouteThumbnail({ points, size = 48 }: Props) {
  if (points.length < 2) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="3" fill="var(--text-faint)" />
      </svg>
    );
  }

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1e-6;
  const lngSpan = maxLng - minLng || 1e-6;
  const padding = 6;
  const drawable = 48 - padding * 2;

  const toXY = (p: Point) => {
    const x = padding + ((p.lng - minLng) / lngSpan) * drawable;
    // Latitude increases upward on a map, but SVG y increases downward.
    const y = padding + (1 - (p.lat - minLat) / latSpan) * drawable;
    return [x, y] as const;
  };

  const coords = points.map(toXY);
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const [startX, startY] = coords[0];

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d={d} stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={startX} cy={startY} r="2.6" fill="#27ae60" />
    </svg>
  );
}
