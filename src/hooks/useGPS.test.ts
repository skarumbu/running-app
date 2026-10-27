import { renderHook, act } from '@testing-library/react';
import { useGPS } from './useGPS';

// ~1.11m per 0.00001 deg of latitude.
const M_PER_DEG = 111195;

let onFix: PositionCallback;

function fix(northMeters: number, ts: number, accuracy = 10) {
  act(() => {
    onFix({
      timestamp: ts,
      coords: { latitude: northMeters / M_PER_DEG, longitude: 0, accuracy, altitude: null } as GeolocationCoordinates,
    } as GeolocationPosition);
  });
}

beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (cb: PositionCallback) => { onFix = cb; return 1; },
      clearWatch: jest.fn(),
    },
  });
});

test('thins fixes to roughly one per 25m and sums distance from kept points', () => {
  const { result } = renderHook(() => useGPS());
  act(() => result.current.start());

  fix(0, 0);
  fix(10, 3000);   // too close, too soon: dropped
  fix(30, 6000);   // 30m from start: kept
  fix(40, 9000);   // dropped
  fix(60, 12000);  // kept

  expect(result.current.waypoints).toHaveLength(3);
  expect(result.current.distanceMeters).toBeGreaterThan(59);
  expect(result.current.distanceMeters).toBeLessThan(61);
});

test('keeps a slow-moving point after 15s', () => {
  const { result } = renderHook(() => useGPS());
  act(() => result.current.start());

  fix(0, 0);
  fix(12, 16000);

  expect(result.current.waypoints).toHaveLength(2);
});

test('accepts coarse fixes up to 100m accuracy and drops worse ones', () => {
  const { result } = renderHook(() => useGPS());
  act(() => result.current.start());

  fix(0, 0, 60);
  fix(100, 5000, 250);

  expect(result.current.waypoints).toHaveLength(1);
});

test('does not re-render while hidden, catches up when visible again', () => {
  const { result } = renderHook(() => useGPS());
  act(() => result.current.start());
  fix(0, 0);

  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fix(30, 6000);
  fix(60, 12000);
  expect(result.current.waypoints).toHaveLength(1);

  visibility.mockReturnValue('visible');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.waypoints).toHaveLength(3);
  visibility.mockRestore();
});
