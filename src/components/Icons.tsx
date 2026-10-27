import React from 'react';
import type { GearKind } from '../lib/feel';

interface IconProps { size?: number; }

const GEAR_PATHS: Record<GearKind, React.ReactNode> = {
  shoe: (
    <>
      <path d="M3 15c0-1 .6-2 2-2l4-1 3-4 2 1-1 3c2 1 5 1.5 7 2 1 .3 1 2 0 2.5L4 17c-.7 0-1-1-1-2Z" fill="currentColor" />
      <path d="M3 19h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  top: <path d="m8 3 4 2 4-2 5 4-3 3-2-1v12H8V9L6 10 3 7l5-4Z" fill="currentColor" />,
  bottom: <path d="M6 3h12l1.5 18h-5L12 10l-2.5 11h-5L6 3Z" fill="currentColor" />,
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" stroke="currentColor" strokeWidth="2.4" fill="none" />
      <rect x="3" y="13" width="5" height="7" rx="2" fill="currentColor" />
      <rect x="16" y="13" width="5" height="7" rx="2" fill="currentColor" />
    </>
  ),
  hat: (
    <>
      <path d="M4 14a8 8 0 0 1 16 0H4Z" fill="currentColor" />
      <path d="M12 14h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="8" fill="currentColor" />
      <path d="M8.5 12h7M12 8.5v7" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

export function GearKindIcon({ kind, size = 24 }: IconProps & { kind: GearKind }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {GEAR_PATHS[kind] ?? GEAR_PATHS.other}
    </svg>
  );
}

export const RunIcon = ({ size = 22 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="14" cy="4.5" r="2.2" fill="currentColor" />
    <path d="m8 21 3-6 3 2v5M6 11l3-3 4 1 2 3 3 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const ListIcon = ({ size = 22 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M8 6h12M8 12h12M8 18h12" /></g>
    <g fill="currentColor"><circle cx="4" cy="6" r="1.5" /><circle cx="4" cy="12" r="1.5" /><circle cx="4" cy="18" r="1.5" /></g>
  </svg>
);

export const ClosetIcon = ({ size = 22 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M12 4a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V9l9 6.5c.8.6.4 1.5-.5 1.5H3.5c-.9 0-1.3-.9-.5-1.5L12 9" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

export const ChevronIcon = ({ size = 18 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
