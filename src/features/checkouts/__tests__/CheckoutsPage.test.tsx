import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
vi.mock('../useCheckouts', () => ({
  useLocationCheckouts: vi.fn(() => ({ checkouts: [], isLoading: false })),
  returnItem: vi.fn().mockResolvedValue(undefined),
  returnItemInLocation: vi.fn().mockResolvedValue(undefined),
}));

import { CheckoutsPage } from '../CheckoutsPage';
import { returnItem, returnItemInLocation, useLocationCheckouts } from '../useCheckouts';

const mockUseLocationCheckouts = vi.mocked(useLocationCheckouts);

function renderPage() {
  return render(
    <MemoryRouter>
      <CheckoutsPage />
    </MemoryRouter>,
  );
}

const now = new Date().toISOString();

const sampleCheckouts: ItemCheckoutWithContext[] = [
  {
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
    checked_out_at: now,
    returned_at: null,
    returned_by: null,
    return_bin_id: null,
  },
  {
    id: 'co-2',
    item_id: 'item-2',
    item_name: 'Wrench',
    origin_bin_id: 'bin-2',
    origin_bin_name: 'Garage Shelf',
    origin_bin_icon: '',
    origin_bin_color: '',
    origin_area_id: null,
    origin_area_name: null,
    location_id: 'loc-1',
    checked_out_by: 'user-2',
    checked_out_by_name: 'Bob',
    checked_out_at: now,
    returned_at: null,
    returned_by: null,
    return_bin_id: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocationCheckouts.mockReturnValue({ checkouts: [], isLoading: false });
});

describe('CheckoutsPage', () => {
  it('renders empty state when no checkouts', () => {
    renderPage();
    expect(screen.getByText('No items checked out')).toBeInTheDocument();
    expect(screen.getByText('Items you check out from bins will appear here')).toBeInTheDocument();
  });

  it('renders checkout list with item, bin, and user names', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    expect(screen.getByText('Hammer')).toBeInTheDocument();
    expect(screen.getByText('Tool Box')).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();

    expect(screen.getByText('Wrench')).toBeInTheDocument();
    expect(screen.getByText('Garage Shelf')).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it('filters checkouts by item name', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search items, bins, people...');
    fireEvent.change(searchInput, { target: { value: 'Hammer' } });

    expect(screen.getByText('Hammer')).toBeInTheDocument();
    expect(screen.queryByText('Wrench')).not.toBeInTheDocument();
  });

  it('filters checkouts by bin name', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search items, bins, people...');
    fireEvent.change(searchInput, { target: { value: 'Garage' } });

    expect(screen.getByText('Wrench')).toBeInTheDocument();
    expect(screen.queryByText('Hammer')).not.toBeInTheDocument();
  });

  it('filters checkouts by user name', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search items, bins, people...');
    fireEvent.change(searchInput, { target: { value: 'Bob' } });

    expect(screen.getByText('Wrench')).toBeInTheDocument();
    expect(screen.queryByText('Hammer')).not.toBeInTheDocument();
  });

  it('shows no-matches empty state when search has no results', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search items, bins, people...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('Try a different search')).toBeInTheDocument();
  });

  it('renders return buttons when user canWrite', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    expect(screen.getByLabelText('Return Hammer')).toBeInTheDocument();
    expect(screen.getByLabelText('Return Wrench')).toBeInTheDocument();
  });

  it('hides return buttons when user cannot write', async () => {
    const { usePermissions } = await import('@/lib/usePermissions');
    vi.mocked(usePermissions).mockReturnValue({ canWrite: false } as ReturnType<typeof usePermissions>);
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();

    expect(screen.queryByLabelText('Return Hammer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Return Wrench')).not.toBeInTheDocument();

    // Restore default
    vi.mocked(usePermissions).mockReturnValue({ canWrite: true } as ReturnType<typeof usePermissions>);
  });
});

describe('CheckoutsPage boxless checkouts', () => {
  const areaCheckout: ItemCheckoutWithContext = {
    ...sampleCheckouts[0],
    id: 'co-3',
    item_id: 'item-3',
    item_name: 'Ladder',
    origin_bin_id: null,
    origin_bin_name: null,
    origin_bin_icon: null,
    origin_bin_color: null,
    origin_area_id: 'area-1',
    origin_area_name: 'Garage',
  };
  const looseCheckout: ItemCheckoutWithContext = {
    ...areaCheckout,
    id: 'co-4',
    item_id: 'item-4',
    item_name: 'Tape',
    origin_area_id: null,
    origin_area_name: null,
  };

  it('shows the area name or Unassigned and tolerates search/sort without a box', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: [areaCheckout, looseCheckout], isLoading: false });
    renderPage();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search items, bins, people...'), { target: { value: 'garage' } });
    expect(screen.getByText('Ladder')).toBeInTheDocument();
    expect(screen.queryByText('Tape')).not.toBeInTheDocument();
  });

  it('does not navigate to /bin/null when a boxless row is activated', () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: [looseCheckout], isLoading: false });
    const { container } = renderPage();
    const row = container.querySelector('[role="row"][tabindex="0"]') as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    // Still on the page, no crash, row still rendered
    expect(screen.getByText('Tape')).toBeInTheDocument();
  });

  it('returns a boxless checkout through the location-scoped endpoint', async () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: [looseCheckout], isLoading: false });
    renderPage();
    fireEvent.click(screen.getByLabelText('Return Tape'));
    fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(returnItemInLocation).toHaveBeenCalledWith('loc-1', 'item-4', undefined));
    expect(returnItem).not.toHaveBeenCalled();
  });

  it('still returns a box checkout through the box-nested endpoint', async () => {
    mockUseLocationCheckouts.mockReturnValue({ checkouts: sampleCheckouts, isLoading: false });
    renderPage();
    fireEvent.click(screen.getByLabelText('Return Hammer'));
    fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(returnItem).toHaveBeenCalledWith('bin-1', 'item-1', undefined));
    expect(returnItemInLocation).not.toHaveBeenCalled();
  });
});
