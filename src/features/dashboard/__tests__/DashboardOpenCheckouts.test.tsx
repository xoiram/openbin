import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemCheckoutWithContext } from '@/types';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ activeLocationId: 'loc-1', token: 'test' })),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));
vi.mock('@/lib/usePermissions', () => ({
  usePermissions: vi.fn(() => ({ canWrite: true })),
}));
vi.mock('@/features/checkouts/useCheckouts', () => ({
  returnItem: vi.fn().mockResolvedValue(undefined),
  returnItemInLocation: vi.fn().mockResolvedValue(undefined),
}));

import { returnItem, returnItemInLocation } from '@/features/checkouts/useCheckouts';
import { DashboardOpenCheckouts } from '../DashboardOpenCheckouts';

const base: ItemCheckoutWithContext = {
  id: 'co-1',
  item_id: 'item-1',
  item_name: 'Hammer',
  origin_bin_id: 'bin-1',
  origin_bin_name: 'Tool Box',
  origin_bin_icon: '',
  origin_bin_color: '',
  origin_area_id: null,
  origin_area_name: null,
  location_id: 'loc-1',
  checked_out_by: 'user-1',
  checked_out_by_name: 'Alice',
  checked_out_at: new Date().toISOString(),
  returned_at: null,
  returned_by: null,
  return_bin_id: null,
};
const areaCo: ItemCheckoutWithContext = {
  ...base, id: 'co-2', item_id: 'item-2', item_name: 'Ladder',
  origin_bin_id: null, origin_bin_name: null, origin_bin_icon: null, origin_bin_color: null,
  origin_area_id: 'area-1', origin_area_name: 'Garage',
};
const looseCo: ItemCheckoutWithContext = {
  ...areaCo, id: 'co-3', item_id: 'item-3', item_name: 'Tape', origin_area_id: null, origin_area_name: null,
};

function renderIt(checkouts: ItemCheckoutWithContext[]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<DashboardOpenCheckouts checkouts={checkouts} />} />
        <Route path="/bin/:id" element={<div>BIN PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('DashboardOpenCheckouts', () => {
  it('shows the area name or Unassigned for boxless checkouts', () => {
    renderIt([areaCo, looseCo]);
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('does not navigate to /bin/null for a boxless row', () => {
    renderIt([looseCo]);
    const row = screen.getByLabelText('Tape checked out by Alice, unassigned');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.queryByText('BIN PAGE')).toBeNull();
  });

  it('navigates to the box for a box checkout', () => {
    renderIt([base]);
    fireEvent.click(screen.getByLabelText('Hammer checked out by Alice from Tool Box'));
    expect(screen.getByText('BIN PAGE')).toBeInTheDocument();
  });

  it('returns a boxless checkout via the location-scoped endpoint', async () => {
    renderIt([looseCo]);
    fireEvent.click(screen.getByLabelText('Return Tape'));
    fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(returnItemInLocation).toHaveBeenCalledWith('loc-1', 'item-3', undefined));
    expect(returnItem).not.toHaveBeenCalled();
  });

  it('returns a box checkout via the box-nested endpoint', async () => {
    renderIt([base]);
    fireEvent.click(screen.getByLabelText('Return Hammer'));
    fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(returnItem).toHaveBeenCalledWith('bin-1', 'item-1', undefined));
    expect(returnItemInLocation).not.toHaveBeenCalled();
  });
});
