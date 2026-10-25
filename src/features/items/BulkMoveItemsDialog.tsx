import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BinPickerList } from '@/components/ui/bin-picker-list';
import { useBinList } from '@/features/bins/useBins';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';

interface BulkMoveItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onApply: (ids: string[], targetBinId: string, targetBinName: string) => Promise<void>;
}

export function BulkMoveItemsDialog({ open, onOpenChange, selectedIds, onApply }: BulkMoveItemsDialogProps) {
  const { t } = useTranslation('items');
  const term = useTerminology();
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const { bins } = useBinList(undefined, 'name', undefined, !open);
  const targetName = bins.find((b) => b.id === targetId)?.name ?? '';

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
      title={t('bulkMove.title', {
        count: selectedIds.length,
        defaultValue_one: 'Move {{count}} item',
        defaultValue_other: 'Move {{count}} items',
      })}
      description={t('bulkMove.description', {
        defaultValue: 'Select a {{bin}} to move the items into.',
        bin: term.bin,
      })}
      selectedIds={selectedIds}
      onApply={async (ids) => {
        if (!targetId) return;
        await onApply(ids, targetId, targetName);
      }}
      applyDisabled={!targetId}
      applyLabel={t('bulkMove.submit', { defaultValue: 'Move' })}
      loadingLabel={t('bulkMove.submitting', { defaultValue: 'Moving…' })}
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
