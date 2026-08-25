// src/lib/telemetry.ts
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

const connectionString = process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING;

const appInsights = connectionString
  ? new ApplicationInsights({ config: { connectionString, disableFetchTracking: false } })
  : null;

if (appInsights) {
  appInsights.loadAppInsights();
}

export function trackException(error: Error, properties?: Record<string, unknown>): void {
  if (appInsights) {
    appInsights.trackException({ exception: error, properties });
  } else {
    console.error('[telemetry]', error, properties);
  }
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (appInsights) {
    appInsights.trackEvent({ name }, properties);
  } else {
    console.log('[telemetry]', name, properties);
  }
}
