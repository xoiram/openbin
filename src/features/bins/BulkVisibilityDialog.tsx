import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import type { BinVisibility } from '@/types';
import { updateBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';
import { VisibilityPicker } from './VisibilityPicker';

interface BulkVisibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  onDone: () => void;
}

export function BulkVisibilityDialog({ open, onOpenChange, binIds, onDone }: BulkVisibilityDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const [visibility, setVisibility] = useState<BinVisibility>('location');

  async function apply(ids: string[]) {
    await Promise.all(ids.map((id) => updateBin(id, { visibility })));
    setVisibility('location');
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.visibility.title', { defaultValue: 'Change Visibility' })}
      description={t('bulk.visibility.description', {
        defaultValue: 'Set visibility for {{selected}}. Non-owned {{bins}} set to private will be skipped by the server.',
        selected: selectedLabel,
        bins: term.bins,
      })}
      selectedIds={binIds}
      onApply={apply}
      onApplied={onDone}
    >
      <div className="space-y-2">
        <VisibilityPicker value={visibility} onChange={setVisibility} />
      </div>
    </BulkUpdateDialog>
  );
}
