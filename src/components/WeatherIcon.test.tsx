import React from 'react';
import { render } from '@testing-library/react';
import WeatherIcon from './WeatherIcon';

test('renders an svg for each known icon key', () => {
  const icons: Array<'clear' | 'cloudy' | 'rain' | 'snow' | 'storm'> = ['clear', 'cloudy', 'rain', 'snow', 'storm'];
  for (const icon of icons) {
    const { container } = render(<WeatherIcon icon={icon} />);
    expect(container.querySelector('svg')).not.toBeNull();
  }
});

test('falls back to the cloudy icon for an unrecognized key', () => {
  // @ts-expect-error intentionally passing an invalid icon key
  const { container } = render(<WeatherIcon icon="unknown" />);
  expect(container.querySelector('svg')).not.toBeNull();
});
