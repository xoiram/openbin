import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemEntry } from '../useItems';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ activeLocationId: 'loc-1', token: 'tok', user: { id: 'u1' } }),
}));

const perms = { canWrite: true };
vi.mock('@/lib/usePermissions', () => ({ usePermissions: () => ({ canWrite: perms.canWrite }) }));

const showToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast }) }));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const listCalls: Array<{ search: unknown; sort: unknown; order: unknown; filters: unknown }> = [];
let mockItems: ItemEntry[] = [];
vi.mock('../useItems', () => ({
  usePaginatedItemList: (search: unknown, sort: unknown, order: unknown, filters: unknown) => {
    listCalls.push({ search, sort, order, filters });
    return { items: mockItems, totalCount: mockItems.length, isLoading: false, isLoadingMore: false, hasMore: false, loadMore: vi.fn() };
  },
}));

vi.mock('@/features/areas/useAreas', async () => {
  const actual = await vi.importActual<typeof import('@/features/areas/useAreas')>('@/features/areas/useAreas');
  const areas = [
    { id: 'a1', name: 'Garage', parent_id: null, location_id: 'loc-1', bin_count: 0, descendant_bin_count: 0, created_by: null, created_at: '', updated_at: '' },
    { id: 'a2', name: 'Attic', parent_id: null, location_id: 'loc-1', bin_count: 0, descendant_bin_count: 0, created_by: null, created_at: '', updated_at: '' },
  ];
  return { ...actual, useAreaList: () => ({ areas, unassignedCount: 0, unassignedItemCount: 0, isLoading: false }) };
});

const mockAddItemsToBin = vi.fn();
vi.mock('@/features/bins/useBins', () => ({
  addItemsToBin: (...a: unknown[]) => mockAddItemsToBin(...a),
  useBin: () => ({ bin: undefined, isLoading: false }),
  useBinSearch: () => ({ bins: [], isLoading: false }),
}));

const mockCreateLoose = vi.fn();
vi.mock('../looseItems', () => ({
  createLooseItem: (...a: unknown[]) => mockCreateLoose(...a),
  notifyItemsChanged: vi.fn(),
}));

const mockCheckout = vi.fn();
const mockRemove = vi.fn();
const mockRename = vi.fn();
vi.mock('../itemActions', () => ({
  checkoutItemSafe: (...a: unknown[]) => mockCheckout(...a),
  removeItemSafe: (...a: unknown[]) => mockRemove(...a),
  renameItemSafe: (...a: unknown[]) => mockRename(...a),
  updateQuantitySafe: vi.fn(),
}));

import { ItemsPage } from '../ItemsPage';

function Probe() {
  const loc = useLocation();
  return <div data-testid="url">{loc.pathname + loc.search}</div>;
}

function renderPage(url = '/items') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ItemsPage />
      <Probe />
    </MemoryRouter>,
  );
}

const lastFilters = () => listCalls[listCalls.length - 1].filters;
const url = () => screen.getByTestId('url').textContent;

const boxItem: ItemEntry = { id: 'i1', name: 'Hammer', quantity: 3, bin_id: 'b1', bin_name: 'Tools', bin_icon: 'Wrench', bin_color: '', area_id: 'a1', area_name: 'Garage' };
const looseItem: ItemEntry = { id: 'i2', name: 'Ladder', quantity: null, bin_id: null, bin_name: null, bin_icon: null, bin_color: null, area_id: 'a1', area_name: 'Garage' };

beforeEach(() => {
  vi.clearAllMocks();
  listCalls.length = 0;
  perms.canWrite = true;
  mockItems = [boxItem, looseItem];
  mockCheckout.mockResolvedValue({ ok: true });
  mockRemove.mockResolvedValue({ ok: true });
  mockRename.mockResolvedValue({ ok: true });
  mockCreateLoose.mockResolvedValue({});
  mockAddItemsToBin.mockResolvedValue([]);
});

describe('ItemsPage filters', () => {
  it('starts with no filters', () => {
    renderPage();
    expect(lastFilters()).toEqual({ areaId: null, unassigned: false, loose: false });
    expect(screen.queryByText('Clear filters')).toBeNull();
  });

  it('restores filters from the URL', () => {
    renderPage('/items?area_id=a2&loose=true');
    expect(lastFilters()).toEqual({ areaId: 'a2', unassigned: false, loose: true });
    expect(screen.getByRole('button', { name: 'Not in a bin' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Clear filters')).toBeTruthy();
  });

  it('restores ?unassigned=true', () => {
    renderPage('/items?unassigned=true');
    expect(lastFilters()).toEqual({ areaId: null, unassigned: true, loose: false });
  });

  it('picking an area sets area_id in the URL and the request filters', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by area' }));
    fireEvent.click(screen.getByRole('option', { name: /Attic/ }));
    expect(url()).toBe('/items?area_id=a2');
    expect(lastFilters()).toMatchObject({ areaId: 'a2', unassigned: false });
  });

  it('choosing Unassigned clears the area filter, and picking an area clears Unassigned', () => {
    renderPage('/items?area_id=a1');
    fireEvent.click(screen.getByRole('button', { name: 'Filter by area' }));
    fireEvent.click(screen.getByRole('option', { name: 'Unassigned' }));
    expect(url()).toBe('/items?unassigned=true');
    expect(lastFilters()).toMatchObject({ areaId: null, unassigned: true });

    fireEvent.click(screen.getByRole('button', { name: 'Filter by area' }));
    fireEvent.click(screen.getByRole('option', { name: /Garage/ }));
    expect(url()).toBe('/items?area_id=a1');
    expect(lastFilters()).toMatchObject({ areaId: 'a1', unassigned: false });
  });

  it('the "Not in a bin" toggle sets and removes loose=true', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Not in a bin' }));
    expect(url()).toBe('/items?loose=true');
    expect(lastFilters()).toMatchObject({ loose: true });
    fireEvent.click(screen.getByRole('button', { name: 'Not in a bin' }));
    expect(url()).toBe('/items');
  });

  it('Clear filters removes all three params but keeps the search', () => {
    renderPage('/items?area_id=a1&loose=true&q=ham');
    fireEvent.click(screen.getByText('Clear filters'));
    expect(url()).toBe('/items?q=ham');
    expect(lastFilters()).toMatchObject({ areaId: null, unassigned: false, loose: false });
  });

  it('shows a filter-specific empty state with a clear button when nothing matches', () => {
    mockItems = [];
    renderPage('/items?loose=true');
    expect(screen.getByText('No items match these filters')).toBeTruthy();
    fireEvent.click(within(screen.getByText('No items match these filters').closest('div')!.parentElement!).getByText('Clear filters'));
    expect(url()).toBe('/items');
  });
});

describe('ItemsPage add item deep link', () => {
  it('?add=1 opens the dialog and removes the param', async () => {
    renderPage('/items?add=1');
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(url()).toBe('/items');
  });

  it('?add=1&area_id= opens with "In an area" and that area preselected, keeping the filter', async () => {
    renderPage('/items?add=1&area_id=a2');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'In an area' }).getAttribute('aria-checked')).toBe('true');
    expect(within(dialog).getByText('Attic')).toBeTruthy();
    expect(url()).toBe('/items?area_id=a2');
  });

  it('does not open for viewers', () => {
    perms.canWrite = false;
    renderPage('/items?add=1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull();
  });

  it('the Add item button opens the dialog', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});

describe('ItemsPage row actions', () => {
  const openMenu = (rowName: RegExp) => {
    fireEvent.click(within(screen.getByLabelText(rowName)).getByRole('button', { name: 'Item actions' }));
  };

  it('hides the action menu from viewers', () => {
    perms.canWrite = false;
    renderPage();
    expect(screen.queryByRole('button', { name: 'Item actions' })).toBeNull();
  });

  it('Check out a box item uses the box home', async () => {
    renderPage();
    openMenu(/Hammer/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Check out' }));
    await waitFor(() => expect(mockCheckout).toHaveBeenCalledWith({ binId: 'b1' }, 'i1'));
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Checked out Hammer' }));
  });

  it('Check out a loose item uses the location home', async () => {
    renderPage();
    openMenu(/Ladder/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Check out' }));
    await waitFor(() => expect(mockCheckout).toHaveBeenCalledWith({ binId: null, locationId: 'loc-1' }, 'i2'));
  });

  it('shows the error when an action fails', async () => {
    mockCheckout.mockResolvedValue({ ok: false, error: 'Already checked out' });
    renderPage();
    openMenu(/Hammer/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Check out' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith({ message: 'Already checked out', variant: 'error' }));
  });

  it('Edit renames and sets the quantity with the right home', async () => {
    renderPage();
    openMenu(/Ladder/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Big ladder' } });
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRename).toHaveBeenCalledWith({ binId: null, locationId: 'loc-1' }, 'i2', 'Big ladder', 2));
  });

  it('Edit on a box item uses the box home and clears an empty quantity', async () => {
    renderPage();
    openMenu(/Hammer/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRename).toHaveBeenCalledWith({ binId: 'b1' }, 'i1', 'Hammer', null));
  });

  it('Delete asks for confirmation, then removes with the right home', async () => {
    renderPage();
    openMenu(/Ladder/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(mockRemove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith({ binId: null, locationId: 'loc-1' }, 'i2'));
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Deleted Ladder' }));
  });

  it('Move… opens the move dialog for just that item and moves it to an area', async () => {
    mockApiFetch.mockResolvedValue({ moved: 1 });
    renderPage();
    openMenu(/Hammer/);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move 1 item')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'In an area' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /No area/ }));
    fireEvent.mouseDown(await screen.findByText('Attic'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/items/bulk-move', { method: 'POST', body: { ids: ['i1'], targetAreaId: 'a2' } }),
    );
  });
});
