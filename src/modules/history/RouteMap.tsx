import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Waypoint } from '../../hooks/useGPS';

interface Props { waypoints: Waypoint[]; }

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
      <Polyline positions={positions} color="#1a5c52" weight={4} />
      <CircleMarker center={start} radius={7} pathOptions={{ color: '#27ae60', fillColor: '#27ae60', fillOpacity: 1 }} />
      <CircleMarker center={finish} radius={7} pathOptions={{ color: '#c0392b', fillColor: '#c0392b', fillOpacity: 1 }} />
      <FitBounds waypoints={waypoints} />
    </MapContainer>
  );
}
