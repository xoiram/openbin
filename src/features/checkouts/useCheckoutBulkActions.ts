import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { Events, notify } from '@/lib/eventBus';

type ToastFn = (toast: { message: string; variant?: 'error' | 'success' }) => void;

export function useCheckoutBulkActions(
  locationId: string | null,
  clearSelection: () => void,
  showToast: ToastFn,
) {
  const { t } = useTranslation('checkouts');
  const [isBusy, setIsBusy] = useState(false);

  const call = useCallback(
    async (
      checkoutIds: string[],
      targetBinId: string | undefined,
      targetName: string | undefined,
    ) => {
      if (!locationId) return;
      setIsBusy(true);
      try {
        const body: Record<string, unknown> = { checkoutIds };
        if (targetBinId) body.targetBinId = targetBinId;
        const { returned, errors } = await apiFetch<{
          returned: number;
          errors: Array<{ id: string; reason: string }>;
        }>(`/api/locations/${encodeURIComponent(locationId)}/checkouts/bulk-return`, {
          method: 'POST',
          body,
        });
        notify(Events.CHECKOUTS);
        notify(Events.BINS);
        clearSelection();
        const main = targetName
          ? t('bulkToasts.returnedTo', {
              count: returned,
              name: targetName,
              defaultValue_one: 'Returned {{count}} item to {{name}}',
              defaultValue_other: 'Returned {{count}} items to {{name}}',
            })
          : t('bulkToasts.returned', {
              count: returned,
              defaultValue_one: 'Returned {{count}} item',
              defaultValue_other: 'Returned {{count}} items',
            });
        const message = errors.length > 0
          ? t('bulkToasts.withFailures', { defaultValue: '{{main}}. {{failed}} failed.', main, failed: errors.length })
          : main;
        showToast({ message });
      } finally {
        setIsBusy(false);
      }
    },
    [locationId, clearSelection, showToast, t],
  );

  const bulkReturn = useCallback(
    (checkoutIds: string[]) => call(checkoutIds, undefined, undefined),
    [call],
  );
  const bulkReturnToBin = useCallback(
    (checkoutIds: string[], targetBinId: string, targetBinName: string) =>
      call(checkoutIds, targetBinId, targetBinName),
    [call],
  );

  return { bulkReturn, bulkReturnToBin, isBusy };
}
