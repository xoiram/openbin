import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaPicker } from '@/features/areas/AreaPicker';
import { useAuth } from '@/lib/auth';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import type { Bin } from '@/types';
import { runEach, SkippedChildrenNote, splitChildren, useBulkResultToast } from './bulkNesting';
import { updateBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  /** Loaded boxes, used to spot selected boxes that sit inside another box (their area follows the parent). */
  bins?: Bin[];
  onDone: () => void;
}

export function BulkAreaDialog({ open, onOpenChange, binIds, bins, onDone }: BulkAreaDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const { activeLocationId } = useAuth();
  const [areaId, setAreaId] = useState<string | null>(null);

  const report = useBulkResultToast();
  const { eligible, childCount } = splitChildren(binIds, bins);

  async function apply(ids: string[]) {
    const { eligible: toUpdate, childCount: skipped } = splitChildren(ids, bins);
    const result = await runEach(toUpdate, (id) => updateBin(id, { areaId }));
    setAreaId(null);
    report(result, skipped);
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.area.title', { defaultValue: 'Move to {{Area}}', Area: term.Area })}
      description={t('bulk.area.description', { defaultValue: 'Assign {{selected}} to {{area}}.', selected: selectedLabel, area: term.area })}
      selectedIds={binIds}
      onApply={apply}
      applyDisabled={eligible.length === 0}
      onApplied={onDone}
      loadingLabel={t('bulk.moving', { defaultValue: 'Moving...' })}
    >
      <div className="space-y-2">
        <SkippedChildrenNote count={childCount} />
        <AreaPicker
          locationId={activeLocationId ?? undefined}
          value={areaId}
          onChange={setAreaId}
        />
      </div>
    </BulkUpdateDialog>
  );
}
