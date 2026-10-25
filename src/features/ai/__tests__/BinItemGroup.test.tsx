import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { BinItemGroup } from '../BinItemGroup';
import type { BinQueryMatch } from '../useInventoryQuery';

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/features/items/itemActions', () => ({
  checkoutItemSafe: vi.fn().mockResolvedValue({ ok: true }),
  removeItemSafe: vi.fn().mockResolvedValue({ ok: true }),
  renameItemSafe: vi.fn().mockResolvedValue({ ok: true }),
  updateQuantitySafe: vi.fn().mockResolvedValue({ ok: true, quantity: null }),
}));

const baseMatch: BinQueryMatch = {
  bin_id: 'b1',
  name: 'Camping Gear',
  area_name: 'Garage',
  items: [
    { id: 'i1', name: 'Tent', quantity: null },
    { id: 'i2', name: 'Sleeping bag', quantity: 4 },
  ],
  total_item_count: 2,
  tags: [],
  relevance: 'name contains "camping"',
  icon: '',
  color: '#22c55e',
};

function renderGroup(match: BinQueryMatch, onBinClick = vi.fn()) {
  return render(
    <MemoryRouter>
      <BinItemGroup match={match} canWrite={false} onBinClick={onBinClick} />
    </MemoryRouter>,
  );
}

describe('BinItemGroup', () => {
  it('renders bin header text always', () => {
    renderGroup(baseMatch);
    expect(screen.getByText('Camping Gear')).toBeDefined();
  });

  it('hides items by default (collapsed) for non-item kinds', () => {
    renderGroup(baseMatch);
    const toggle = screen.getByRole('button', { name: /show 2 items in camping gear/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('auto-expands when single item match (kind=item, items.length=1)', () => {
    const match: BinQueryMatch = {
      ...baseMatch,
      items: [{ id: 'i1', name: 'drill', quantity: null }],
      total_item_count: 12,
      relevance: 'contains "drill"',
    };
    renderGroup(match);
    const toggle = screen.getByRole('button', { name: /hide 1 item in camping gear/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking the disclosure toggles aria-expanded and does not invoke onBinClick', () => {
    const onBinClick = vi.fn();
    renderGroup(baseMatch, onBinClick);
    const toggle = screen.getByRole('button', { name: /show 2 items in camping gear/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(onBinClick).not.toHaveBeenCalled();
  });

  it('clicking the bin name area calls onBinClick', () => {
    const onBinClick = vi.fn();
    renderGroup(baseMatch, onBinClick);
    fireEvent.click(screen.getByRole('button', { name: /open camping gear/i }));
    expect(onBinClick).toHaveBeenCalledWith('b1', undefined);
  });

  it('renders nav-disclosure (no aria-expanded) when items empty but total > 0', () => {
    const match: BinQueryMatch = {
      ...baseMatch,
      items: [],
      total_item_count: 12,
    };
    renderGroup(match);
    expect(screen.queryByRole('button', { name: /show.*items/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /hide.*items/i })).toBeNull();
    expect(screen.getByText('12 items')).toBeDefined();
  });

  it('renders header-only (no pill) when bin has no items at all', () => {
    const match: BinQueryMatch = {
      ...baseMatch,
      items: [],
      total_item_count: 0,
    };
    renderGroup(match);
    expect(screen.queryByRole('button', { name: /items/i })).toBeNull();
    expect(screen.queryByText(/items/)).toBeNull();
  });

  describe('path subtitle', () => {
    it('shows the area for a top-level box (own name stripped from bin_path)', () => {
      renderGroup({ ...baseMatch, kind: 'bin', bin_path: 'Garage › Camping Gear', parent_bin_id: null, parent_bin_name: '' });
      expect(screen.getByText('Garage')).toBeDefined();
      expect(screen.getAllByText('Camping Gear')).toHaveLength(1);
    });

    it('shows area and parent box once for a child box', () => {
      renderGroup({
        ...baseMatch,
        kind: 'bin',
        name: 'Drawer',
        bin_path: 'Garage › Toolbox › Drawer',
        parent_bin_id: 'p1',
        parent_bin_name: 'Toolbox',
      });
      expect(screen.getByText('Garage › Toolbox')).toBeDefined();
      expect(screen.getByRole('button', { name: /show 2 items in drawer/i })).toBeDefined();
    });

    it('shows no subtitle for an unassigned top-level box', () => {
      renderGroup({ ...baseMatch, area_name: '', bin_path: 'Camping Gear' });
      expect(screen.getAllByText('Camping Gear')).toHaveLength(1);
      expect(screen.queryByText('Garage')).toBeNull();
    });

    it('falls back to area_name for an old payload without kind or bin_path', () => {
      renderGroup(baseMatch);
      expect(screen.getByText('Garage')).toBeDefined();
    });
  });
});
