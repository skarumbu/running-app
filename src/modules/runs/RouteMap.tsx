import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Waypoint } from '../../hooks/useGPS';

interface Props { waypoints: Waypoint[]; }

// Leaflet draws with SVG attributes, which can't take var(); read the
// palette tokens instead so the map follows the theme.
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function FitBounds({ waypoints }: Props) {
  const map = useMap();
  useEffect(() => {
    if (waypoints.length < 2) return;
    const bounds = waypoints.map(w => [w.lat, w.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, waypoints]);
  return null;
}

export default function RouteMap({ waypoints }: Props) {
  if (waypoints.length < 2) {
    return <div className="map-placeholder">No route data</div>;
  }

  const positions = waypoints.map(w => [w.lat, w.lng] as [number, number]);
  const start = positions[0];
  const finish = positions[positions.length - 1];
  const center = positions[Math.floor(positions.length / 2)];

  return (
    <MapContainer center={center} zoom={14} className="route-map" zoomControl={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Polyline positions={positions} pathOptions={{ color: token('--a1'), weight: 5 }} />
      <CircleMarker center={start} radius={7} pathOptions={{ color: token('--surface'), weight: 3, fillColor: token('--a4'), fillOpacity: 1 }} />
      <CircleMarker center={finish} radius={7} pathOptions={{ color: token('--surface'), weight: 3, fillColor: token('--ink'), fillOpacity: 1 }} />
      <FitBounds waypoints={waypoints} />
    </MapContainer>
  );
}
