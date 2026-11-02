// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom's test environment doesn't expose Node's TextEncoder/TextDecoder
// globally, but react-router-dom v7's bundle references them at import
// time. Polyfill from Node's built-in 'util' module.
import { TextEncoder, TextDecoder } from 'util';
if (typeof (global as any).TextEncoder === 'undefined') {
  (global as any).TextEncoder = TextEncoder;
}
if (typeof (global as any).TextDecoder === 'undefined') {
  (global as any).TextDecoder = TextDecoder;
}

// jsdom has no Web Crypto; the run outbox uses it for client run ids.
if (!(globalThis as any).crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: require('crypto').webcrypto, configurable: true });
}
