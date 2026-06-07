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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, waypoints.length]);
  return null;
}

export default function TrackMap({ waypoints }: Props) {
  if (waypoints.length < 2) {
    return <div className="map-placeholder">No route data</div>;
  }

  return (
    <MapContainer
      center={[waypoints[0].lat, waypoints[0].lng]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: '240px', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Polyline positions={waypoints.map(w => [w.lat, w.lng])} color="#007bff" weight={4} />
      <CircleMarker center={[waypoints[0].lat, waypoints[0].lng]} radius={6} pathOptions={{ color: 'green' }} />
      <CircleMarker center={[waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng]} radius={6} pathOptions={{ color: 'red' }} />
      <FitBounds waypoints={waypoints} />
    </MapContainer>
  );
}
