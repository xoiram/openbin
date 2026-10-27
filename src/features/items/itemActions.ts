import i18next from 'i18next';
import { removeItemFromBin, renameItem, updateItemQuantity } from '@/features/bins/useBins';
import { checkoutItem, checkoutItemInLocation } from '@/features/checkouts/useCheckouts';
import { getErrorMessage } from '@/lib/utils';
import { deleteLooseItem, updateLooseItem } from './looseItems';

export type ItemActionOutcome = { ok: true } | { ok: false; error: string };
export type QuantityOutcome =
  | { ok: true; quantity: number | null; removed?: boolean }
  | { ok: false; error: string };

/**
 * Where an item lives: in a box (`binId`) or not (`binId: null`, i.e. in an area or unassigned). Box items
 * use the box routes and need nothing else; items outside a box use the location-scoped routes, which is
 * why they must say which location.
 */
export type ItemHome = { binId: string; locationId?: string } | { binId: null; locationId: string };

// Plain module (no hook), so it translates through the app's i18next singleton
// at call time rather than via useTranslation().
function fallbackMessage(): string {
  return i18next.t('items:actions.requestFailed', { defaultValue: 'Request failed' });
}

export async function checkoutItemSafe(home: ItemHome, itemId: string): Promise<ItemActionOutcome> {
  try {
    if (home.binId !== null) await checkoutItem(home.binId, itemId);
    else await checkoutItemInLocation(home.locationId, itemId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}

export async function removeItemSafe(home: ItemHome, itemId: string): Promise<ItemActionOutcome> {
  try {
    if (home.binId !== null) await removeItemFromBin(home.binId, itemId);
    else await deleteLooseItem(home.locationId, itemId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}

export async function renameItemSafe(
  home: ItemHome,
  itemId: string,
  name: string,
  quantity?: number | null,
): Promise<ItemActionOutcome> {
  try {
    if (home.binId !== null) {
      await renameItem(home.binId, itemId, name, quantity);
    } else {
      await updateLooseItem(home.locationId, itemId, quantity === undefined ? { name } : { name, quantity });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}

/** Set an item's quantity; a quantity of 0 or less removes the item (as it does for box items). */
export async function updateQuantitySafe(
  home: ItemHome,
  itemId: string,
  quantity: number,
): Promise<QuantityOutcome> {
  try {
    if (home.binId !== null) {
      const r = await updateItemQuantity(home.binId, itemId, quantity);
      if (r.removed) return { ok: true, quantity: null, removed: true };
      return { ok: true, quantity: r.quantity ?? null };
    }
    if (quantity <= 0) {
      await deleteLooseItem(home.locationId, itemId);
      return { ok: true, quantity: null, removed: true };
    }
    const r = await updateLooseItem(home.locationId, itemId, { quantity });
    return { ok: true, quantity: r.quantity ?? null };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}
