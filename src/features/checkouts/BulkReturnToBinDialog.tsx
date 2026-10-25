import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BinPickerList } from '@/components/ui/bin-picker-list';
import { useBinList } from '@/features/bins/useBins';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import type { ItemCheckoutWithContext } from '@/types';

interface BulkReturnToBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkouts: ItemCheckoutWithContext[];
  onApply: (checkoutIds: string[], targetBinId: string, targetBinName: string) => Promise<void>;
}

export function BulkReturnToBinDialog({
  open,
  onOpenChange,
  checkouts,
  onApply,
}: BulkReturnToBinDialogProps) {
  const { t } = useTranslation('checkouts');
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const { bins } = useBinList(undefined, 'name', undefined, !open);
  const targetName = bins.find((b) => b.id === targetId)?.name ?? '';
  const originBinCount = useMemo(
    () => new Set(checkouts.map((c) => c.origin_bin_id)).size,
    [checkouts],
  );

  const ids = checkouts.map((c) => c.id);

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setTargetId(null);
          setSearch('');
        }
        onOpenChange(v);
      }}
      title={t('bulkReturnToBin.title', {
        count: ids.length,
        defaultValue_one: 'Return {{count}} item to chosen bin',
        defaultValue_other: 'Return {{count}} items to chosen bin',
      })}
      description={t('bulkReturnToBin.description', {
        count: originBinCount,
        defaultValue_one: "Items currently span {{count}} bin. They'll all move to the picked destination.",
        defaultValue_other: "Items currently span {{count}} bins. They'll all move to the picked destination.",
      })}
      selectedIds={ids}
      onApply={async (checkoutIds) => {
        if (!targetId) return;
        await onApply(checkoutIds, targetId, targetName);
      }}
      applyDisabled={!targetId}
      applyLabel={t('return.submit', { defaultValue: 'Return' })}
      loadingLabel={t('return.submitting', { defaultValue: 'Returning…' })}
    >
      <BinPickerList
        selectedBinId={targetId}
        onSelect={setTargetId}
        search={search}
        onSearchChange={setSearch}
        paused={!open}
      />
    </BulkUpdateDialog>
  );
}
