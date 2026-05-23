import { useState, useRef, useCallback } from 'react';

export interface Waypoint {
  lat: number;
  lng: number;
  ts: number;
  alt?: number;
}

interface GPSState {
  waypoints: Waypoint[];
  distanceMeters: number;
  currentCoords: GeolocationCoordinates | null;
  error: string | null;
  acquiring: boolean;
}

function haversineMeters(a: Waypoint, b: Waypoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a2 =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
}

export function useGPS() {
  const [state, setState] = useState<GPSState>({
    waypoints: [],
    distanceMeters: 0,
    currentCoords: null,
    error: null,
    acquiring: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const waypointsRef = useRef<Waypoint[]>([]);
  const distanceRef = useRef(0);

  const start = useCallback(() => {
    setState(s => ({ ...s, acquiring: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > 30) return; // discard low-accuracy fixes

        const wp: Waypoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: pos.timestamp,
          alt: pos.coords.altitude ?? undefined,
        };

        const prev = waypointsRef.current[waypointsRef.current.length - 1];
        if (prev) {
          distanceRef.current += haversineMeters(prev, wp);
        }
        waypointsRef.current = [...waypointsRef.current, wp];

        setState(s => ({
          ...s,
          waypoints: waypointsRef.current,
          distanceMeters: distanceRef.current,
          currentCoords: pos.coords,
          acquiring: false,
          error: null,
        }));
      },
      (err) => {
        setState(s => ({ ...s, error: err.message, acquiring: false }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    waypointsRef.current = [];
    distanceRef.current = 0;
    setState({
      waypoints: [],
      distanceMeters: 0,
      currentCoords: null,
      error: null,
      acquiring: false,
    });
  }, [stop]);

  return { ...state, start, stop, reset };
}
