import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocationSelectList } from '@/features/locations/LocationSelectList';
import { useLocationList } from '@/features/locations/useLocations';
import { useAuth } from '@/lib/auth';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import { moveBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  onDone: () => void;
}

export function BulkLocationDialog({ open, onOpenChange, binIds, onDone }: BulkLocationDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const { activeLocationId } = useAuth();
  const { locations } = useLocationList();
  const otherLocations = locations.filter((l) => l.id !== activeLocationId);
  const [targetId, setTargetId] = useState<string | null>(null);

  async function apply(ids: string[]) {
    if (!targetId) return;
    await Promise.all(ids.map((id) => moveBin(id, targetId)));
    setTargetId(null);
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
      applyDisabled={!targetId}
      applyLabel={t('bulk.location.apply', { defaultValue: 'Move' })}
      loadingLabel={t('bulk.moving', { defaultValue: 'Moving...' })}
    >
      <LocationSelectList
        locations={otherLocations}
        value={targetId}
        onChange={setTargetId}
        emptyMessage={t('bulk.location.empty', { defaultValue: 'No other {{locations}} available.', locations: term.locations })}
      />
    </BulkUpdateDialog>
  );
}
