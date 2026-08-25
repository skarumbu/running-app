import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves with the original value when the promise settles before the timeout', async () => {
    const inner = Promise.resolve('done');
    const result = withTimeout(inner, 1000, 'timed out');
    await expect(result).resolves.toBe('done');
  });

  test('rejects with the original error when the promise rejects before the timeout', async () => {
    const inner = Promise.reject(new Error('boom'));
    const result = withTimeout(inner, 1000, 'timed out');
    await expect(result).rejects.toThrow('boom');
  });

  test('rejects with the timeout message when the promise never settles', async () => {
    const inner = new Promise<string>(() => {}); // never resolves or rejects
    const result = withTimeout(inner, 1000, 'timed out after 1s');
    result.catch(() => {}); // attach a handler before advancing timers, avoid unhandled-rejection noise
    jest.advanceTimersByTime(1000);
    await expect(result).rejects.toThrow('timed out after 1s');
  });

  test('does not fire the timeout after the promise already resolved', async () => {
    const inner = Promise.resolve('fast');
    const result = withTimeout(inner, 1000, 'timed out');
    await expect(result).resolves.toBe('fast');
    jest.advanceTimersByTime(1000);
    // no unhandled rejection / no crash — nothing to assert beyond "didn't throw"
  });
});
