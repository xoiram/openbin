import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Events, notify } from '@/lib/eventBus';
import { checkoutItemSafe, type ItemHome, removeItemSafe, renameItemSafe } from './itemActions';
import { notifyItemsChanged } from './looseItems';
import type { ItemEntry } from './useItems';

type ToastFn = (toast: {
  message: string;
  variant?: 'error' | 'success';
  action?: { label: string; onClick: () => void };
}) => void;

/** Where a table row's item lives: its box, or (outside a box) the active location. Null without a location. */
export function itemHomeOf(entry: ItemEntry, locationId: string | null | undefined): ItemHome | null {
  if (entry.bin_id) return { binId: entry.bin_id };
  return locationId ? { binId: null, locationId } : null;
}

/** Per-row item actions (edit, check out, move, delete) for the Items table. */
export function useItemRowActions(showToast: ToastFn) {
  const { t } = useTranslation('items');
  const { activeLocationId } = useAuth();
  const [editing, setEditing] = useState<ItemEntry | null>(null);
  const [moving, setMoving] = useState<ItemEntry | null>(null);
  const [deleting, setDeleting] = useState<ItemEntry | null>(null);

  const fail = useCallback((error: string) => showToast({ message: error, variant: 'error' }), [showToast]);

  const checkout = useCallback(async (entry: ItemEntry) => {
    const home = itemHomeOf(entry, activeLocationId);
    if (!home) return;
    const r = await checkoutItemSafe(home, entry.id);
    if (!r.ok) return fail(r.error);
    notify(Events.CHECKOUTS);
    notifyItemsChanged();
    showToast({ message: t('looseItems.actions.checkedOut', { defaultValue: 'Checked out {{name}}', name: entry.name }), variant: 'success' });
  }, [activeLocationId, fail, showToast, t]);

  const remove = useCallback(async (entry: ItemEntry) => {
    const home = itemHomeOf(entry, activeLocationId);
    if (!home) return;
    const r = await removeItemSafe(home, entry.id);
    if (!r.ok) return fail(r.error);
    showToast({ message: t('looseItems.actions.deleted', { defaultValue: 'Deleted {{name}}', name: entry.name }), variant: 'success' });
  }, [activeLocationId, fail, showToast, t]);

  const save = useCallback(async (entry: ItemEntry, name: string, quantity: number | null): Promise<boolean> => {
    const home = itemHomeOf(entry, activeLocationId);
    if (!home) return false;
    const r = await renameItemSafe(home, entry.id, name, quantity);
    if (!r.ok) {
      fail(r.error);
      return false;
    }
    showToast({ message: t('looseItems.edit.saved', { defaultValue: 'Updated {{name}}', name }), variant: 'success' });
    return true;
  }, [activeLocationId, fail, showToast, t]);

  return { editing, setEditing, moving, setMoving, deleting, setDeleting, checkout, remove, save };
}
