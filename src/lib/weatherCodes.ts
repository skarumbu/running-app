import type { WeatherIconKey } from './runTypes';

// WMO weather codes from Open-Meteo. Mirrors WEATHER_CODE_MAP in
// api/function_app.py so pre-run weather reads the same as saved weather.
const CODES: Record<number, [string, WeatherIconKey]> = {
  0: ['Clear', 'clear'],
  1: ['Mainly clear', 'clear'],
  2: ['Partly cloudy', 'cloudy'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'cloudy'],
  48: ['Fog', 'cloudy'],
  51: ['Light drizzle', 'rain'],
  53: ['Drizzle', 'rain'],
  55: ['Heavy drizzle', 'rain'],
  56: ['Light freezing drizzle', 'rain'],
  57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent rain showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with hail', 'storm'],
};

export function weatherFromCode(code: number): { condition: string; icon: WeatherIconKey } {
  const [condition, icon] = CODES[code] ?? ['Unknown', 'cloudy'];
  return { condition, icon };
}
