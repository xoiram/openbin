import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeItemFromBin, renameItem, updateItemQuantity } from '@/features/bins/useBins';
import { checkoutItem, checkoutItemInLocation } from '@/features/checkouts/useCheckouts';
import { checkoutItemSafe, removeItemSafe, renameItemSafe, updateQuantitySafe } from '../itemActions';
import { deleteLooseItem, updateLooseItem } from '../looseItems';

vi.mock('@/features/checkouts/useCheckouts', () => ({
  checkoutItem: vi.fn(async () => ({ id: 'c1' })),
  checkoutItemInLocation: vi.fn(async () => ({ id: 'c2' })),
}));
vi.mock('@/features/bins/useBins', () => ({
  removeItemFromBin: vi.fn(async () => undefined),
  renameItem: vi.fn(async () => undefined),
  updateItemQuantity: vi.fn(async () => ({ id: 'i1', quantity: 3 })),
}));
vi.mock('../looseItems', () => ({
  deleteLooseItem: vi.fn(async () => undefined),
  updateLooseItem: vi.fn(async (_loc: string, id: string, c: { quantity?: number | null }) => ({ id, name: 'X', quantity: c.quantity ?? null })),
}));

const inBox = { binId: 'bin1', locationId: 'loc1' };
const outsideBox = { binId: null, locationId: 'loc1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('itemActions for an item in a box', () => {
  it('checkoutItemSafe uses the box route', async () => {
    expect(await checkoutItemSafe(inBox, 'item1')).toEqual({ ok: true });
    expect(checkoutItem).toHaveBeenCalledWith('bin1', 'item1');
    expect(checkoutItemInLocation).not.toHaveBeenCalled();
  });

  it('removeItemSafe uses the box route', async () => {
    expect(await removeItemSafe(inBox, 'item1')).toEqual({ ok: true });
    expect(removeItemFromBin).toHaveBeenCalledWith('bin1', 'item1');
    expect(deleteLooseItem).not.toHaveBeenCalled();
  });

  it('renameItemSafe passes name and quantity through', async () => {
    expect(await renameItemSafe(inBox, 'item1', 'New name', 5)).toEqual({ ok: true });
    expect(renameItem).toHaveBeenCalledWith('bin1', 'item1', 'New name', 5);
  });

  it('updateQuantitySafe returns the new quantity', async () => {
    expect(await updateQuantitySafe(inBox, 'item1', 3)).toEqual({ ok: true, quantity: 3 });
    expect(updateItemQuantity).toHaveBeenCalledWith('bin1', 'item1', 3);
  });

  it('turns a thrown error into { ok: false } with its message', async () => {
    vi.mocked(removeItemFromBin).mockRejectedValueOnce(new Error('Nope'));
    expect(await removeItemSafe(inBox, 'item1')).toEqual({ ok: false, error: 'Nope' });
  });
});

describe('itemActions for an item outside a box (in an area or unassigned)', () => {
  it('checkoutItemSafe uses the location-scoped route', async () => {
    expect(await checkoutItemSafe(outsideBox, 'item1')).toEqual({ ok: true });
    expect(checkoutItemInLocation).toHaveBeenCalledWith('loc1', 'item1');
    expect(checkoutItem).not.toHaveBeenCalled();
  });

  it('removeItemSafe deletes it through the location route', async () => {
    expect(await removeItemSafe(outsideBox, 'item1')).toEqual({ ok: true });
    expect(deleteLooseItem).toHaveBeenCalledWith('loc1', 'item1');
    expect(removeItemFromBin).not.toHaveBeenCalled();
  });

  it('renameItemSafe sends only the name when no quantity is given, and both when it is', async () => {
    await renameItemSafe(outsideBox, 'item1', 'New name');
    expect(updateLooseItem).toHaveBeenLastCalledWith('loc1', 'item1', { name: 'New name' });
    await renameItemSafe(outsideBox, 'item1', 'New name', null);
    expect(updateLooseItem).toHaveBeenLastCalledWith('loc1', 'item1', { name: 'New name', quantity: null });
  });

  it('updateQuantitySafe sets the quantity', async () => {
    expect(await updateQuantitySafe(outsideBox, 'item1', 4)).toEqual({ ok: true, quantity: 4 });
    expect(updateLooseItem).toHaveBeenCalledWith('loc1', 'item1', { quantity: 4 });
  });

  it('updateQuantitySafe removes the item at zero, like box items do', async () => {
    expect(await updateQuantitySafe(outsideBox, 'item1', 0)).toEqual({ ok: true, quantity: null, removed: true });
    expect(deleteLooseItem).toHaveBeenCalledWith('loc1', 'item1');
    expect(updateLooseItem).not.toHaveBeenCalled();
  });
});
