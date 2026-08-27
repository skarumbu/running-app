import React from 'react';
import { render } from '@testing-library/react';
import RouteThumbnail from './RouteThumbnail';

test('renders an svg polyline for a valid route', () => {
  const points = [
    { lat: 47.65, lng: -122.32 },
    { lat: 47.651, lng: -122.321 },
    { lat: 47.652, lng: -122.319 },
  ];
  const { container } = render(<RouteThumbnail points={points} />);
  expect(container.querySelector('svg')).not.toBeNull();
  expect(container.querySelector('path')).not.toBeNull();
});

test('renders nothing meaningful for fewer than 2 points', () => {
  const { container } = render(<RouteThumbnail points={[{ lat: 47.65, lng: -122.32 }]} />);
  expect(container.querySelector('path')).toBeNull();
});

test('does not throw when all points are identical', () => {
  const points = [{ lat: 47.65, lng: -122.32 }, { lat: 47.65, lng: -122.32 }];
  const { container } = render(<RouteThumbnail points={points} />);
  expect(container.querySelector('svg')).not.toBeNull();
});
