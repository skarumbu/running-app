import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GearTab from './GearTab';
import { gearPattern } from './gearPattern';
import type { Gear } from '../../lib/runTypes';

const mockApiFetch = jest.fn();
const mockSignOut = jest.fn();

jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ apiFetch: mockApiFetch, signOut: mockSignOut }),
}));

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) } as Response);
}

function gear(overrides: Partial<Gear>): Gear {
  return {
    id: 'g1', name: 'Pegasus 41', kind: 'shoe', color: 'a1', retired: false,
    run_count: 0, rated_count: 0, avg_comfort: null, ...overrides,
  };
}

function renderGear(path = '/gear') {
  return render(<MemoryRouter initialEntries={[path]}><GearTab /></MemoryRouter>);
}

beforeEach(() => { mockApiFetch.mockReset(); mockSignOut.mockReset(); });

test('adds gear with a name, kind and colour', async () => {
  mockApiFetch
    .mockReturnValueOnce(jsonResponse([]))
    .mockReturnValueOnce(jsonResponse(gear({ id: 'g9', name: 'Shokz OpenRun', kind: 'headphones', color: 'a5' }), 201));
  renderGear();

  fireEvent.click(await screen.findByRole('button', { name: '+ Add gear' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shokz OpenRun' } });
  fireEvent.click(screen.getByRole('button', { name: 'Headphones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Colour 5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('button', { name: 'Edit Shokz OpenRun' })).toBeInTheDocument();
  const [url, options] = mockApiFetch.mock.calls[1];
  expect(url).toBe('/api/gear');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({ name: 'Shokz OpenRun', kind: 'headphones', color: 'a5' });
});

test('opens the add form straight away when linked with ?add=1', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([]));
  renderGear('/gear?add=1');
  expect(await screen.findByRole('form', { name: 'Add gear' })).toBeInTheDocument();
});

test('retiring gear moves it to the retired list and keeps its history', async () => {
  mockApiFetch
    .mockReturnValueOnce(jsonResponse([gear({ run_count: 4, rated_count: 2, avg_comfort: 2.5 })]))
    .mockReturnValueOnce(jsonResponse(gear({ retired: true, run_count: 4, rated_count: 2, avg_comfort: 2.5 })));
  renderGear();

  fireEvent.click(await screen.findByRole('button', { name: 'Edit Pegasus 41' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retire' }));

  const retired = await screen.findByText('Retired');
  const section = retired.closest('section')!;
  expect(within(section).getByText('Pegasus 41')).toBeInTheDocument();
  expect(within(section).getByText(/4 runs/)).toBeInTheDocument();
  expect(within(section).getByRole('button', { name: 'Bring back' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit Pegasus 41' })).not.toBeInTheDocument();
  const [url, options] = mockApiFetch.mock.calls[1];
  expect(url).toBe('/api/gear/g1');
  expect(JSON.parse(options.body)).toEqual({ retired: true });
});

test('the pattern line is hidden until an item has 3 rated runs', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([
    gear({ run_count: 5, rated_count: 2, avg_comfort: 3 }),
    gear({ id: 'g2', name: 'Blue tee', kind: 'top', run_count: 2, rated_count: 2, avg_comfort: 1 }),
  ]));
  renderGear();
  await screen.findByRole('button', { name: 'Edit Pegasus 41' });
  expect(screen.queryByText('Pattern')).not.toBeInTheDocument();
});

test('gearPattern names the comfiest active item with 3+ rated runs', () => {
  expect(gearPattern([gear({ rated_count: 2, avg_comfort: 3 })])).toBeNull();
  expect(gearPattern([gear({ rated_count: 5, avg_comfort: 3, retired: true })])).toBeNull();
  expect(gearPattern([
    gear({ rated_count: 3, avg_comfort: 2.1 }),
    gear({ id: 'g2', name: 'Shokz OpenRun', rated_count: 6, avg_comfort: 2.9 }),
  ])).toBe('Shokz OpenRun is your comfiest: it usually felt great across 6 rated runs.');
});

test('sign out lives in the gear header', async () => {
  mockApiFetch.mockReturnValueOnce(jsonResponse([]));
  renderGear();
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(mockSignOut).toHaveBeenCalled();
});
