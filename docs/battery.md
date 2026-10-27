# Battery during a run

The app is now tuned for low battery use rather than precise time and distance.
A recognizable route line and a roughly right distance are the goal.

## What costs battery here

In rough order, biggest first:

1. **The screen.** A lit display for a 45-minute run costs more than everything
   else combined. The app used to hold a screen wake lock for the whole run.
2. **The GPS radio at full power.** The background-geolocation plugin asks iOS for
   `kCLLocationAccuracyBest` (or `BestForNavigation` while charging), which keeps
   the GNSS radio fully on.
3. **Waking the JS bridge.** With `distanceFilter: 0` the plugin uses
   `kCLDistanceFilterNone`, so iOS delivers about one fix per second and each one
   wakes the WebView and runs JavaScript.
4. **React and Leaflet re-renders.** Every fix and every timer tick re-rendered
   `TrackTab` and its live map, even with the screen locked.

## What changed

| Area | Before | After | Where |
|---|---|---|---|
| Screen | Wake lock held for the whole run | No wake lock. Tracking continues with the screen locked through `UIBackgroundModes=location` | `useWakeLock.ts` deleted |
| Desired accuracy | `Best` / `BestForNavigation` (hard-coded in the plugin) | `kCLLocationAccuracyNearestTenMeters` | `patches/@capacitor-community+background-geolocation+1.2.26.patch` |
| Activity type | Not set (`.other`) | `.fitness` | same patch |
| Distance filter | 0, which means none (~1 fix/s) | 30 m | `useGPS.ts` `NATIVE_DISTANCE_FILTER_M` |
| JS accuracy filter | Drop fixes worse than 30 m | Drop fixes worse than 100 m | `useGPS.ts` `MAX_ACCURACY_M` |
| Stored waypoints | Every accepted fix | One per 25 m, or per 15 s if you moved at least 10 m | `useGPS.ts` `recordFix` |
| Background renders | Each fix and each second re-rendered | No state updates while the page is hidden. State catches up on `visibilitychange` | `useGPS.ts`, `useRunTimer.ts` |
| Timer | `setInterval` counting seconds | Elapsed time derived from timestamps. The interval only refreshes the display, and only while visible | `useRunTimer.ts` |

The plugin patch is applied by `patch-package` from the `postinstall` script, so
`npm ci` in the iOS workflows patches the pod source before `cap sync` and
`xcodebuild`. If you bump the plugin version, regenerate the patch: edit
`node_modules/@capacitor-community/background-geolocation/ios/Plugin/Swift/Plugin.swift`,
then run `npx patch-package @capacitor-community/background-geolocation`.

### Deliberately not changed

- **`pausesLocationUpdatesAutomatically` stays `false`.** iOS can pause updates
  when it thinks you've stopped, but it doesn't resume them in the background on
  its own. The plugin has no `didPauseLocationUpdates` handling, so one long
  traffic light could silently end the recorded route.
- **The lock-screen notification** is already static: shown on start and cleared
  on finish, with no periodic updates.
- **`UIBackgroundModes=location`** is required for screen-off tracking.

## Trade-offs

- **Route detail:** about one point per 25 to 30 m. Tight switchbacks and track
  laps get flattened into chords. The route shape is still clearly recognizable
  on a street map.
- **Distance:** summed over thinned points, so curves read a little short (cutting
  corners). Accuracy jitter, now up to 100 m, can add a little in open areas.
  Expect a few percent of error either way. The new UI shows distance under
  "By the numbers" only.
- **Time:** exact, because it comes from timestamps and not from ticks.
- **Payload:** a 5 km run stores about 200 waypoints instead of about 1,500.

## Still worth doing with a device

- Measure a 30-minute run on the phone, unplugged, before and after (Settings >
  Battery shows per-app use), and compare the route and distance with a watch.
- Try `kCLLocationAccuracyHundredMeters`. It is much cheaper, but in cities it
  may fall back to Wi-Fi or cell positions and lose the route.
- The live `TrackMap` refits its bounds on every new point, which can fetch new
  tiles. Once the redesign settles, consider showing the map only on the finish
  screen, or refitting less often.
