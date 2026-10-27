import { renderHook, act } from '@testing-library/react';
import { useRunTimer } from './useRunTimer';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
});
afterEach(() => jest.useRealTimers());

test('elapsed comes from timestamps and excludes paused time', () => {
  const { result } = renderHook(() => useRunTimer());
  act(() => result.current.start());
  act(() => { jest.advanceTimersByTime(5000); });
  expect(result.current.elapsedSeconds).toBe(5);

  act(() => result.current.pause());
  act(() => { jest.advanceTimersByTime(60000); });
  expect(result.current.elapsedSeconds).toBe(5);

  act(() => result.current.resume());
  act(() => { jest.advanceTimersByTime(3000); });
  expect(result.current.elapsedSeconds).toBe(8);
});

test('stops ticking while hidden and catches up when visible', () => {
  const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const { result } = renderHook(() => useRunTimer());
  act(() => result.current.start());

  visibility.mockReturnValue('hidden');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  act(() => { jest.advanceTimersByTime(120000); });
  expect(result.current.elapsedSeconds).toBe(0);

  visibility.mockReturnValue('visible');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.elapsedSeconds).toBe(120);
  visibility.mockRestore();
});

test('pausing twice (pause then finish) does not double-count', () => {
  const { result } = renderHook(() => useRunTimer());
  act(() => result.current.start());
  act(() => { jest.advanceTimersByTime(10000); });
  act(() => result.current.pause());
  act(() => { jest.advanceTimersByTime(30000); });
  act(() => result.current.pause());
  expect(result.current.elapsedSeconds).toBe(10);
});
