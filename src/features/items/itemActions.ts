import i18next from 'i18next';
import { removeItemFromBin, renameItem, updateItemQuantity } from '@/features/bins/useBins';
import { checkoutItem } from '@/features/checkouts/useCheckouts';
import { getErrorMessage } from '@/lib/utils';

export type ItemActionOutcome = { ok: true } | { ok: false; error: string };
export type QuantityOutcome =
  | { ok: true; quantity: number | null; removed?: boolean }
  | { ok: false; error: string };

// Plain module (no hook), so it translates through the app's i18next singleton
// at call time rather than via useTranslation().
function fallbackMessage(): string {
  return i18next.t('items:actions.requestFailed', { defaultValue: 'Request failed' });
}

export async function checkoutItemSafe(binId: string, itemId: string): Promise<ItemActionOutcome> {
  try {
    await checkoutItem(binId, itemId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}

export async function removeItemSafe(binId: string, itemId: string): Promise<ItemActionOutcome> {
  try {
    await removeItemFromBin(binId, itemId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}

export async function renameItemSafe(
  binId: string,
  itemId: string,
  name: string,
  quantity?: number | null,
): Promise<ItemActionOutcome> {
  try {
    await renameItem(binId, itemId, name, quantity);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}

export async function updateQuantitySafe(
  binId: string,
  itemId: string,
  quantity: number,
): Promise<QuantityOutcome> {
  try {
    const r = await updateItemQuantity(binId, itemId, quantity);
    if (r.removed) return { ok: true, quantity: null, removed: true };
    return { ok: true, quantity: r.quantity ?? null };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err, fallbackMessage()) };
  }
}
