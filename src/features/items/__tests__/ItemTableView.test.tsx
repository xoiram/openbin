import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ItemTableView } from '../ItemTableView';
import type { ItemEntry } from '../useItems';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({ bins: 'bins', bin: 'bin', Bin: 'Bin', location: 'location', area: 'area' }),
}));

function makeItem(overrides: Partial<ItemEntry> = {}): ItemEntry {
  return {
    id: 'item-1',
    name: 'Hammer',
    quantity: 3,
    bin_id: 'b1',
    bin_name: 'Tools',
    bin_icon: 'Wrench',
    bin_color: '30:3',
    area_id: null,
    area_name: null,
    ...overrides,
  };
}

const defaultProps = {
  sortColumn: 'alpha' as const,
  sortDirection: 'asc' as const,
  onSortChange: vi.fn(),
  searchQuery: '',
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
};

describe('ItemTableView icon+color badge', () => {
  it('renders a combined icon+color badge with data-testid="bin-icon-badge"', () => {
    render(
      <MemoryRouter>
        <ItemTableView items={[makeItem()]} {...defaultProps} />
      </MemoryRouter>,
    );
    const badge = screen.getByTestId('bin-icon-badge');
    expect(badge).toBeTruthy();
  });

  it('applies the bin color as background on the badge', () => {
    render(
      <MemoryRouter>
        <ItemTableView items={[makeItem()]} {...defaultProps} />
      </MemoryRouter>,
    );
    const badge = screen.getByTestId('bin-icon-badge');
    expect(badge.style.backgroundColor).toBeTruthy();
    // Should NOT be the tertiary text color fallback
    expect(badge.style.backgroundColor).not.toBe('var(--text-tertiary)');
  });

  it('falls back to tertiary background when bin has no color', () => {
    render(
      <MemoryRouter>
        <ItemTableView items={[makeItem({ bin_color: '' })]} {...defaultProps} />
      </MemoryRouter>,
    );
    const badge = screen.getByTestId('bin-icon-badge');
    expect(badge.style.backgroundColor).toBe('var(--text-tertiary)');
  });

  it('does not render a separate color dot element', () => {
    const { container } = render(
      <MemoryRouter>
        <ItemTableView items={[makeItem()]} {...defaultProps} />
      </MemoryRouter>,
    );
    // The old pattern had a h-2 w-2 rounded-full dot — should no longer exist
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBe(0);
  });
});

describe('ItemTableView selection', () => {
  const items: ItemEntry[] = [
    makeItem({ id: 'a', name: 'Hammer', quantity: 1, bin_id: 'bin-1', bin_name: 'Garage', bin_icon: '', bin_color: '' }),
    makeItem({ id: 'b', name: 'Saw', quantity: 2, bin_id: 'bin-1', bin_name: 'Garage', bin_icon: '', bin_color: '' }),
  ];

  it('renders checkboxes when selectable', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ItemTableView
          items={items}
          {...defaultProps}
          selectable
          selectedIds={new Set(['a'])}
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('clicking a checkbox calls onSelect', () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ItemTableView
          items={items}
          {...defaultProps}
          selectable
          selectedIds={new Set()}
          onSelect={onSelect}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onSelect).toHaveBeenCalledWith('a', 0, false);
  });
});

describe('ItemTableView items without a box', () => {
  const boxless = {
    bin_id: null, bin_name: null, bin_icon: null, bin_color: null,
  } as const;

  it('shows the area name and no box badge for an item in an area', () => {
    render(
      <MemoryRouter>
        <ItemTableView items={[makeItem({ ...boxless, area_id: 'a1', area_name: 'Garage' })]} {...defaultProps} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.queryByTestId('bin-icon-badge')).toBeNull();
  });

  it('shows Unassigned for an item with neither box nor area', () => {
    render(
      <MemoryRouter>
        <ItemTableView items={[makeItem({ ...boxless })]} {...defaultProps} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('does not navigate when a boxless row is activated', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Routes>
          <Route path="/items" element={<ItemTableView items={[makeItem({ ...boxless })]} {...defaultProps} />} />
          <Route path="/bin/:id" element={<div>BIN PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const row = screen.getByLabelText('Hammer (3), unassigned');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.queryByText('BIN PAGE')).toBeNull();
    expect(screen.getByText('Hammer')).toBeInTheDocument();
  });

  it('still navigates to the box for an item in a box', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Routes>
          <Route path="/items" element={<ItemTableView items={[makeItem()]} {...defaultProps} />} />
          <Route path="/bin/:id" element={<div>BIN PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('Hammer (3) in Tools'));
    expect(screen.getByText('BIN PAGE')).toBeInTheDocument();
  });
});

describe('ItemTableView location column', () => {
  const boxless = { bin_id: null, bin_name: null, bin_icon: null, bin_color: null } as const;
  const cell = () => screen.getByTestId('item-location');

  it('has a header that says where the item is stored', () => {
    render(<MemoryRouter><ItemTableView items={[makeItem()]} {...defaultProps} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Sort by Stored in' })).toBeInTheDocument();
  });

  it('a box item shows the box badge and name, not the area', () => {
    render(<MemoryRouter><ItemTableView items={[makeItem({ area_id: 'a1', area_name: 'Garage' })]} {...defaultProps} /></MemoryRouter>);
    expect(within(cell()).getByTestId('bin-icon-badge')).toBeInTheDocument();
    expect(within(cell()).getByText('Tools')).toBeInTheDocument();
    expect(within(cell()).queryByText('Garage')).toBeNull();
  });

  it('an item in an area shows a folder icon and the area name', () => {
    const { container } = render(
      <MemoryRouter><ItemTableView items={[makeItem({ ...boxless, area_id: 'a1', area_name: 'Garage' })]} {...defaultProps} /></MemoryRouter>,
    );
    expect(within(cell()).getByText('Garage')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="item-location"] svg.lucide-folder-tree')).not.toBeNull();
    expect(within(cell()).queryByTestId('bin-icon-badge')).toBeNull();
  });

  it('an unassigned item shows an italic Unassigned with no icon', () => {
    const { container } = render(
      <MemoryRouter><ItemTableView items={[makeItem({ ...boxless })]} {...defaultProps} /></MemoryRouter>,
    );
    expect(within(cell()).getByText('Unassigned').className).toContain('italic');
    expect(container.querySelector('[data-testid="item-location"] svg')).toBeNull();
  });
});

describe('ItemTableView row actions', () => {
  const handlers = () => ({ onEdit: vi.fn(), onCheckout: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() });

  it('renders no menu without handlers', () => {
    render(<MemoryRouter><ItemTableView items={[makeItem()]} {...defaultProps} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Item actions' })).toBeNull();
  });

  it.each([
    ['Edit', 'onEdit'],
    ['Check out', 'onCheckout'],
    ['Move…', 'onMove'],
    ['Delete', 'onDelete'],
  ] as const)('%s calls %s with the row entry', (label, key) => {
    const h = handlers();
    const entry = makeItem();
    render(<MemoryRouter><ItemTableView items={[entry]} {...defaultProps} rowActions={h} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Item actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    expect(h[key]).toHaveBeenCalledWith(entry);
  });

  it('opening the menu does not navigate to the box', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Routes>
          <Route path="/items" element={<ItemTableView items={[makeItem()]} {...defaultProps} rowActions={handlers()} />} />
          <Route path="/bin/:id" element={<div>BIN PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Item actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.queryByText('BIN PAGE')).toBeNull();
  });
});
