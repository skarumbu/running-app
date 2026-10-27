import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { weatherFromCode } from '../../lib/weatherCodes';
import type { WeatherSummary } from '../../lib/runTypes';

/**
 * Current weather at the device, for the pre-run screen. Best effort only:
 * it never prompts for location (it runs only when permission was already
 * granted), never blocks, and stays null on any failure.
 *
 * Skipped on native iOS, where the web geolocation API would show a second,
 * web-view permission prompt on top of the app's own. The saved run still
 * gets weather from the server.
 */
export function useCurrentWeather(): WeatherSummary | null {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !navigator.geolocation || !navigator.permissions) return;
    let cancelled = false;

    navigator.permissions.query({ name: 'geolocation' as PermissionName })
      .then(status => {
        if (status.state !== 'granted' || cancelled) return;
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude, longitude } = pos.coords;
            fetch(
              'https://api.open-meteo.com/v1/forecast' +
              `?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
              '&current=temperature_2m,weather_code&temperature_unit=fahrenheit'
            )
              .then(r => (r.ok ? r.json() : null))
              .then(data => {
                const current = data?.current;
                if (cancelled || typeof current?.temperature_2m !== 'number') return;
                setWeather({ temp_f: Math.round(current.temperature_2m), ...weatherFromCode(current.weather_code) });
              })
              .catch(() => {});
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 15 * 60 * 1000, timeout: 8000 }
        );
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return weather;
}
