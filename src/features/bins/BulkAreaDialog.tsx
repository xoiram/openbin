import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaPicker } from '@/features/areas/AreaPicker';
import { useAuth } from '@/lib/auth';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import { updateBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  onDone: () => void;
}

export function BulkAreaDialog({ open, onOpenChange, binIds, onDone }: BulkAreaDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const { activeLocationId } = useAuth();
  const [areaId, setAreaId] = useState<string | null>(null);

  async function apply(ids: string[]) {
    await Promise.all(ids.map((id) => updateBin(id, { areaId })));
    setAreaId(null);
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.area.title', { defaultValue: 'Move to {{Area}}', Area: term.Area })}
      description={t('bulk.area.description', { defaultValue: 'Assign {{selected}} to {{area}}.', selected: selectedLabel, area: term.area })}
      selectedIds={binIds}
      onApply={apply}
      onApplied={onDone}
      loadingLabel={t('bulk.moving', { defaultValue: 'Moving...' })}
    >
      <div className="space-y-2">
        <AreaPicker
          locationId={activeLocationId ?? undefined}
          value={areaId}
          onChange={setAreaId}
        />
      </div>
    </BulkUpdateDialog>
  );
}
