import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { Events, notify } from '@/lib/eventBus';
import { notifyItemsChanged } from './looseItems';

type ToastFn = (toast: {
  message: string;
  variant?: 'error' | 'success';
  action?: { label: string; onClick: () => void };
}) => void;

/** Where moved items go: exactly one of a box, an area or "unassigned" (in no box and no area). */
export type ItemMoveTarget = { binId: string } | { areaId: string } | { unassigned: true };

export function moveTargetBody(target: ItemMoveTarget): Record<string, unknown> {
  if ('binId' in target) return { targetBinId: target.binId };
  if ('areaId' in target) return { targetAreaId: target.areaId };
  return { unassigned: true };
}

export type QuantityOp = 'set' | 'clear' | 'inc' | 'dec';

export function useItemBulkActions(clearSelection: () => void, showToast: ToastFn) {
  const { t } = useTranslation(['items', 'common']);
  const [isBusy, setIsBusy] = useState(false);

  const bulkDelete = useCallback(async (ids: string[]) => {
    setIsBusy(true);
    try {
      const { deleted } = await apiFetch<{ deleted: number }>('/api/items/bulk-delete', {
        method: 'POST',
        body: { ids },
      });
      notify(Events.BINS);
      clearSelection();
      showToast({
        message: t('bulkToasts.deleted', {
          count: deleted,
          defaultValue_one: 'Deleted {{count}} item',
          defaultValue_other: 'Deleted {{count}} items',
        }),
        action: {
          label: t('bulkToasts.undo', { defaultValue: 'Undo' }),
          onClick: async () => {
            await apiFetch('/api/items/bulk-restore', { method: 'POST', body: { ids } });
            notify(Events.BINS);
          },
        },
      });
    } finally {
      setIsBusy(false);
    }
  }, [clearSelection, showToast, t]);

  const bulkCheckout = useCallback(async (ids: string[]) => {
    setIsBusy(true);
    try {
      const { checkedOut, errors } = await apiFetch<{ checkedOut: number; errors: Array<{ id: string; reason: string }> }>(
        '/api/items/bulk-checkout',
        { method: 'POST', body: { ids } },
      );
      notify(Events.BINS);
      notify(Events.CHECKOUTS);
      clearSelection();
      const main = t('bulkToasts.checkedOut', {
        count: checkedOut,
        defaultValue_one: 'Checked out {{count}} item',
        defaultValue_other: 'Checked out {{count}} items',
      });
      const message = errors.length > 0
        ? t('bulkToasts.withFailures', { defaultValue: '{{main}}. {{failed}} failed.', main, failed: errors.length })
        : main;
      showToast({ message });
    } finally {
      setIsBusy(false);
    }
  }, [clearSelection, showToast, t]);

  const bulkMove = useCallback(async (ids: string[], target: ItemMoveTarget, targetName: string) => {
    setIsBusy(true);
    try {
      const { moved } = await apiFetch<{ moved: number }>('/api/items/bulk-move', {
        method: 'POST',
        body: { ids, ...moveTargetBody(target) },
      });
      notifyItemsChanged();
      clearSelection();
      showToast({
        message: t('bulkToasts.moved', {
          count: moved,
          name: targetName,
          defaultValue_one: 'Moved {{count}} item to {{name}}',
          defaultValue_other: 'Moved {{count}} items to {{name}}',
        }),
      });
    } finally {
      setIsBusy(false);
    }
  }, [clearSelection, showToast, t]);

  const bulkQuantity = useCallback(async (ids: string[], op: QuantityOp, value?: number) => {
    setIsBusy(true);
    try {
      const body: Record<string, unknown> = { ids, op };
      if (op !== 'clear') body.value = value;
      const { updated, removed } = await apiFetch<{ updated: number; removed: number }>(
        '/api/items/bulk-quantity',
        { method: 'POST', body },
      );
      notify(Events.BINS);
      clearSelection();
      const main = t('bulkToasts.updated', {
        count: updated,
        defaultValue_one: 'Updated {{count}} item',
        defaultValue_other: 'Updated {{count}} items',
      });
      const message = removed > 0
        ? t('bulkToasts.withRemoved', { defaultValue: '{{main}}. {{removed}} removed.', main, removed })
        : main;
      showToast({ message });
    } finally {
      setIsBusy(false);
    }
  }, [clearSelection, showToast, t]);

  return { bulkDelete, bulkCheckout, bulkMove, bulkQuantity, isBusy };
}
