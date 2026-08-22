import { useState, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location as BGLocation } from '@capacitor-community/background-geolocation';

// This plugin ships no JS entry point of its own — registerPlugin() is the
// documented way to bind it. See its README for this exact pattern.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

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

  const watchIdRef = useRef<number | null>(null); // web watchPosition id
  const nativeWatcherIdRef = useRef<string | null>(null); // native plugin watcher id
  const waypointsRef = useRef<Waypoint[]>([]);
  const distanceRef = useRef(0);

  const recordFix = useCallback((wp: Waypoint, coords: GeolocationCoordinates) => {
    const prev = waypointsRef.current[waypointsRef.current.length - 1];
    if (prev) {
      distanceRef.current += haversineMeters(prev, wp);
    }
    waypointsRef.current = [...waypointsRef.current, wp];

    setState(s => ({
      ...s,
      waypoints: waypointsRef.current,
      distanceMeters: distanceRef.current,
      currentCoords: coords,
      acquiring: false,
      error: null,
    }));
  }, []);

  const start = useCallback(() => {
    setState(s => ({ ...s, acquiring: true, error: null }));

    if (Capacitor.isNativePlatform()) {
      BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Tracking your run in the background.',
          backgroundTitle: 'Running App',
          requestPermissions: true,
          distanceFilter: 0,
        },
        (location?: BGLocation, error?: Error) => {
          if (error || !location) {
            setState(s => ({ ...s, error: error?.message ?? 'Location error', acquiring: false }));
            return;
          }
          if (location.accuracy > 30) return; // discard low-accuracy fixes

          const wp: Waypoint = {
            lat: location.latitude,
            lng: location.longitude,
            ts: location.time ?? Date.now(),
            alt: location.altitude ?? undefined,
          };
          recordFix(wp, {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            altitude: location.altitude,
            altitudeAccuracy: location.altitudeAccuracy,
            heading: location.bearing,
            speed: location.speed,
          } as GeolocationCoordinates);
        }
      ).then(id => { nativeWatcherIdRef.current = id; });
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > 30) return; // discard low-accuracy fixes

        const wp: Waypoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: pos.timestamp,
          alt: pos.coords.altitude ?? undefined,
        };
        recordFix(wp, pos.coords);
      },
      (err) => {
        setState(s => ({ ...s, error: err.message, acquiring: false }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }, [recordFix]);

  const stop = useCallback(() => {
    if (nativeWatcherIdRef.current !== null) {
      BackgroundGeolocation.removeWatcher({ id: nativeWatcherIdRef.current });
      nativeWatcherIdRef.current = null;
    }
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
