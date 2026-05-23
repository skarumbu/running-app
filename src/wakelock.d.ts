// Screen Wake Lock API types (not yet in lib.dom.d.ts for this TS version)
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: 'screen';
  release(): Promise<void>;
}

interface WakeLock {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

interface Navigator {
  readonly wakeLock: WakeLock;
}
