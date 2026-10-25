import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemQueryResults } from '../ItemQueryResults';
import type { BinQueryMatch, LooseItemQueryMatch, QueryMatch } from '../useInventoryQuery';

const executeBatch = vi.fn();

vi.mock('../useActionExecutor', () => ({
  executeBatch: (...args: unknown[]) => executeBatch(...args),
}));

vi.mock('@/lib/usePermissions', () => ({
  usePermissions: () => ({ canWrite: true }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ activeLocationId: 'loc1' }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/features/items/itemActions', () => ({
  checkoutItemSafe: vi.fn().mockResolvedValue({ ok: true }),
  removeItemSafe: vi.fn().mockResolvedValue({ ok: true }),
  renameItemSafe: vi.fn().mockResolvedValue({ ok: true }),
  updateQuantitySafe: vi.fn().mockResolvedValue({ ok: true, quantity: null }),
}));

const box = (id: string, name: string, over: Partial<BinQueryMatch> = {}): BinQueryMatch => ({
  kind: 'bin',
  bin_id: id,
  name,
  area_name: 'Garage',
  bin_path: `Garage › ${name}`,
  parent_bin_id: null,
  parent_bin_name: '',
  items: [{ id: `${id}-i1`, name: 'Hammer', quantity: null }],
  total_item_count: 1,
  tags: [],
  relevance: 'contains "hammer"',
  icon: '',
  color: '#22c55e',
  ...over,
});

const loose = (id: string, name: string, over: Partial<LooseItemQueryMatch> = {}): LooseItemQueryMatch => ({
  kind: 'loose_item',
  bin_id: null,
  item_id: id,
  name,
  quantity: null,
  area_id: 'a1',
  area_name: 'Garage',
  bin_path: 'Garage',
  items: [],
  total_item_count: 1,
  tags: [],
  relevance: `contains "${name}"`,
  is_trashed: false,
  icon: '',
  color: '',
  ...over,
});

function renderResults(matches: QueryMatch[]) {
  return render(
    <MemoryRouter>
      <ItemQueryResults matches={matches} onBinClick={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('ItemQueryResults', () => {
  beforeEach(() => executeBatch.mockReset());

  it('renders nothing for no matches', () => {
    const { container } = renderResults([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders every box and loose item distinctly, even when a loose item shares a name with a box item', () => {
    const matches = [
      box('b1', 'Toolbox'),
      loose('l1', 'Hammer'),
      loose('l2', 'Hammer', { area_id: null, area_name: '', bin_path: '' }),
    ];
    renderResults(matches);
    expect(screen.getByText('Toolbox')).toBeDefined();
    expect(screen.getAllByTestId('loose-item-row')).toHaveLength(2);
    // Box item "Hammer" is inside the (auto-expanded) box; loose ones are separate rows.
    expect(screen.getAllByText('Hammer')).toHaveLength(3);
  });

  it('does not collapse two loose items with the same name or a loose item with a box', () => {
    renderResults([loose('l1', 'Hammer'), loose('l2', 'Hammer'), box('b1', 'Hammer')]);
    expect(screen.getAllByTestId('loose-item-row')).toHaveLength(2);
    expect(screen.getAllByText('Hammer').length).toBeGreaterThanOrEqual(3);
  });

  it('still dedups an exact repeat of the same loose item or the same box', () => {
    renderResults([loose('l1', 'Hammer'), loose('l1', 'Hammer'), box('b1', 'Toolbox'), box('b1', 'Toolbox')]);
    expect(screen.getAllByTestId('loose-item-row')).toHaveLength(1);
    expect(screen.getAllByText('Toolbox')).toHaveLength(1);
  });

  it('shows the area path, quantity, and a translated Unassigned subtitle for loose items', () => {
    renderResults([
      loose('l1', 'Hammer', { quantity: 3, bin_path: 'Garage › Shelf' }),
      loose('l2', 'Tape', { area_id: null, area_name: '', bin_path: '' }),
    ]);
    const [inArea, unassigned] = screen.getAllByTestId('loose-item-row');
    expect(within(inArea).getByText('Garage › Shelf')).toBeDefined();
    expect(within(inArea).getByText('×3')).toBeDefined();
    expect(within(unassigned).getByText('Unassigned')).toBeDefined();
    expect(screen.getByText('Loose items')).toBeDefined();
  });

  it('gives loose items no checkbox, button or actions', () => {
    renderResults([loose('l1', 'Hammer')]);
    const row = screen.getByTestId('loose-item-row');
    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    expect(within(row).queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('bulk checkout only ever addresses boxes, never loose items', async () => {
    executeBatch.mockResolvedValue({ completedActions: [{}], failedCount: 0 });
    renderResults([loose('l1', 'Hammer'), box('b1', 'Toolbox')]);
    await userEvent.click(screen.getByRole('checkbox', { name: /hammer/i }));
    await userEvent.click(screen.getByRole('button', { name: /checkout/i }));
    expect(executeBatch).toHaveBeenCalledTimes(1);
    const { actions } = executeBatch.mock.calls[0][0];
    expect(actions).toEqual([
      { type: 'checkout_item', bin_id: 'b1', bin_name: 'Toolbox', item_name: 'Hammer' },
    ]);
  });

  it('applies the 8-match limit across boxes and loose items together', () => {
    const matches: QueryMatch[] = [
      ...Array.from({ length: 5 }, (_, i) => box(`b${i}`, `Box ${i}`)),
      ...Array.from({ length: 6 }, (_, i) => loose(`l${i}`, `Thing ${i}`)),
    ];
    renderResults(matches);
    expect(screen.getAllByText(/^Box \d$/)).toHaveLength(5);
    expect(screen.getAllByTestId('loose-item-row')).toHaveLength(3);
  });
});
