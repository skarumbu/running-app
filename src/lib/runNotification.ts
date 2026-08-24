import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const RUN_NOTIFICATION_ID = 1;

// Static lock-screen indicator for an active run — shown on start, cleared on
// finish. No live updates yet; just presence/absence. Native-only (no lock
// screen concept on web), and never lets a permission/schedule failure block
// run tracking itself.

export async function showRunTrackingNotification() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    let { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      ({ display } = await LocalNotifications.requestPermissions());
    }
    if (display !== 'granted') return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: RUN_NOTIFICATION_ID,
          title: 'Running App',
          body: 'Tracking run',
        },
      ],
    });
  } catch {
    // best-effort
  }
}

export async function clearRunTrackingNotification() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: RUN_NOTIFICATION_ID }] });
  } catch {
    // best-effort
  }
}
