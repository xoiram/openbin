import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LooseItemRow } from '../LooseItemRow';
import type { LooseItemQueryMatch } from '../useInventoryQuery';

const m = vi.hoisted(() => ({
  checkoutItemSafe: vi.fn(),
  removeItemSafe: vi.fn(),
  renameItemSafe: vi.fn(),
  updateQuantitySafe: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc1' }) }));
vi.mock('@/features/items/itemActions', () => ({
  checkoutItemSafe: (...a: unknown[]) => m.checkoutItemSafe(...a),
  removeItemSafe: (...a: unknown[]) => m.removeItemSafe(...a),
  renameItemSafe: (...a: unknown[]) => m.renameItemSafe(...a),
  updateQuantitySafe: (...a: unknown[]) => m.updateQuantitySafe(...a),
}));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));

const HOME = { binId: null, locationId: 'loc1' };
const match: LooseItemQueryMatch = {
  kind: 'loose_item',
  bin_id: null,
  item_id: 'l1',
  name: 'Tape',
  quantity: 2,
  area_id: 'a1',
  area_name: 'Garage',
  bin_path: 'Garage › Shelf',
  items: [],
  total_item_count: 1,
  tags: [],
  relevance: '',
  is_trashed: false,
  icon: '',
  color: '',
};

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /item actions/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.checkoutItemSafe.mockResolvedValue({ ok: true });
  m.removeItemSafe.mockResolvedValue({ ok: true });
  m.renameItemSafe.mockResolvedValue({ ok: true });
  m.updateQuantitySafe.mockResolvedValue({ ok: true, quantity: 5 });
});

describe('LooseItemRow', () => {
  it('shows the area path and quantity', () => {
    render(<LooseItemRow match={match} canWrite />);
    expect(screen.getByText('Garage › Shelf')).toBeDefined();
    expect(screen.getByText('×2')).toBeDefined();
  });

  it('has no actions for viewers', () => {
    render(<LooseItemRow match={match} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('offers no Open bin or restore for writers', async () => {
    render(<LooseItemRow match={match} canWrite />);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: /open bin/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /restore/i })).toBeNull();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });

  it('checks out through the location-scoped helper', async () => {
    render(<LooseItemRow match={match} canWrite />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /checkout/i }));
    await waitFor(() => expect(m.checkoutItemSafe).toHaveBeenCalledWith(HOME, 'l1'));
  });

  it('renames through the helper', async () => {
    render(<LooseItemRow match={match} canWrite />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }));
    const input = screen.getByRole('textbox', { name: /item name/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Duct tape{Enter}');
    await waitFor(() => expect(m.renameItemSafe).toHaveBeenCalledWith(HOME, 'l1', 'Duct tape'));
    expect(screen.getByText('Duct tape')).toBeDefined();
  });

  it('changes the quantity with the stepper', async () => {
    render(<LooseItemRow match={match} canWrite />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /adjust quantity/i }));
    await userEvent.click(screen.getByRole('button', { name: /increment/i }));
    await userEvent.type(screen.getByRole('spinbutton'), '{Enter}');
    await waitFor(() => expect(m.updateQuantitySafe).toHaveBeenCalledWith(HOME, 'l1', 3));
    expect(screen.getByText('×5')).toBeDefined();
  });

  it('removes the row when the quantity goes to zero', async () => {
    m.updateQuantitySafe.mockResolvedValue({ ok: true, quantity: null, removed: true });
    render(<LooseItemRow match={match} canWrite />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /adjust quantity/i }));
    await userEvent.click(screen.getByRole('button', { name: /decrement/i }));
    await userEvent.click(screen.getByRole('button', { name: /decrement/i }));
    await userEvent.click(screen.getByRole('button', { name: /decrement/i }));
    await userEvent.type(screen.getByRole('spinbutton'), '{Enter}');
    await waitFor(() => expect(m.updateQuantitySafe).toHaveBeenCalledWith(HOME, 'l1', 0));
    await waitFor(() => expect(screen.queryByTestId('loose-item-row')).toBeNull());
  });

  it('confirms before removing, then removes through the helper', async () => {
    render(<LooseItemRow match={match} canWrite />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /remove/i }));
    expect(m.removeItemSafe).not.toHaveBeenCalled();
    expect(screen.getByText(/permanently remove "Tape"\./i)).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(m.removeItemSafe).toHaveBeenCalledWith(HOME, 'l1'));
  });
});
