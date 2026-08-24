// src/lib/telemetry.test.ts
export {};

const mockTrackException = jest.fn();
const mockTrackEvent = jest.fn();
const mockLoadAppInsights = jest.fn();

jest.mock('@microsoft/applicationinsights-web', () => ({
  ApplicationInsights: jest.fn().mockImplementation(() => ({
    loadAppInsights: mockLoadAppInsights,
    trackException: mockTrackException,
    trackEvent: mockTrackEvent,
  })),
}));

describe('telemetry', () => {
  const originalEnv = process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    mockTrackException.mockClear();
    mockTrackEvent.mockClear();
    mockLoadAppInsights.mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING = originalEnv;
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('when configured, trackException calls through to the SDK', () => {
    process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=fake';
    const { trackException } = require('./telemetry');
    const error = new Error('boom');
    trackException(error, { where: 'test' });
    expect(mockTrackException).toHaveBeenCalledWith({ exception: error, properties: { where: 'test' } });
  });

  test('when configured, trackEvent calls through to the SDK', () => {
    process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=fake';
    const { trackEvent } = require('./telemetry');
    trackEvent('sign_in_attempt', { platform: 'ios' });
    expect(mockTrackEvent).toHaveBeenCalledWith({ name: 'sign_in_attempt' }, { platform: 'ios' });
  });

  test('when unconfigured, trackException falls back to console.error without throwing', () => {
    delete process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING;
    const { trackException } = require('./telemetry');
    const error = new Error('boom');
    expect(() => trackException(error, { where: 'test' })).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[telemetry]', error, { where: 'test' });
    expect(mockTrackException).not.toHaveBeenCalled();
  });

  test('when unconfigured, trackEvent falls back to console.log without throwing', () => {
    delete process.env.REACT_APP_APPINSIGHTS_CONNECTION_STRING;
    const { trackEvent } = require('./telemetry');
    expect(() => trackEvent('sign_in_attempt', { platform: 'ios' })).not.toThrow();
    expect(consoleLogSpy).toHaveBeenCalledWith('[telemetry]', 'sign_in_attempt', { platform: 'ios' });
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});
