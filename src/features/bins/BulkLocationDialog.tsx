import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocationSelectList } from '@/features/locations/LocationSelectList';
import { useLocationList } from '@/features/locations/useLocations';
import { useAuth } from '@/lib/auth';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import type { Bin } from '@/types';
import { runEach, SkippedChildrenNote, splitChildren, useBulkResultToast } from './bulkNesting';
import { moveBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  /** Loaded boxes, used to spot selected boxes that sit inside another box (they move with their parent). */
  bins?: Bin[];
  onDone: () => void;
}

export function BulkLocationDialog({ open, onOpenChange, binIds, bins, onDone }: BulkLocationDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const { activeLocationId } = useAuth();
  const { locations } = useLocationList();
  const otherLocations = locations.filter((l) => l.id !== activeLocationId);
  const [targetId, setTargetId] = useState<string | null>(null);

  const report = useBulkResultToast();
  const { eligible, childCount } = splitChildren(binIds, bins);

  async function apply(ids: string[]) {
    if (!targetId) return;
    const { eligible: toMove, childCount: skipped } = splitChildren(ids, bins);
    const result = await runEach(toMove, (id) => moveBin(id, targetId));
    setTargetId(null);
    report(result, skipped);
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.location.title', { defaultValue: 'Move to {{Location}}', Location: term.Location })}
      description={t('bulk.location.description', {
        defaultValue: 'Move {{selected}} to another {{location}}.',
        selected: selectedLabel,
        location: term.location,
      })}
      selectedIds={binIds}
      onApply={apply}
      onApplied={onDone}
      applyDisabled={!targetId || eligible.length === 0}
      applyLabel={t('bulk.location.apply', { defaultValue: 'Move' })}
      loadingLabel={t('bulk.moving', { defaultValue: 'Moving...' })}
    >
      <div className="space-y-2">
        <SkippedChildrenNote count={childCount} />
        <LocationSelectList
          locations={otherLocations}
          value={targetId}
          onChange={setTargetId}
          emptyMessage={t('bulk.location.empty', { defaultValue: 'No other {{locations}} available.', locations: term.locations })}
        />
      </div>
    </BulkUpdateDialog>
  );
}
