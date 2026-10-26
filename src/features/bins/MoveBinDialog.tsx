import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LocationSelectList } from '@/features/locations/LocationSelectList';
import { useTerminology } from '@/lib/terminology';
import type { Location } from '@/types';

interface MoveBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binName: string;
  locations: Location[];
  onConfirm: (locationId: string) => void;
  /** Number of boxes inside this one; they move along with it. */
  childCount?: number;
}

export function MoveBinDialog({ open, onOpenChange, binName, locations, onConfirm, childCount = 0 }: MoveBinDialogProps) {
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const [targetId, setTargetId] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) setTargetId(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('moveDialog.title', { defaultValue: 'Move to another {{location}}', location: term.location })}</DialogTitle>
          <DialogDescription>
            {t('moveDialog.description', { defaultValue: "Select a {{location}} to move the '{{name}}' {{bin}}.", location: term.location, name: binName, bin: term.bin })}
          </DialogDescription>
          {childCount > 0 && (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {t('nesting.moveWithChildren', {
                count: childCount,
                bin: term.bin,
                bins: term.bins,
                defaultValue_one: 'The {{count}} {{bin}} inside it moves along.',
                defaultValue_other: 'The {{count}} {{bins}} inside it move along.',
              })}
            </p>
          )}
        </DialogHeader>
        <div className="py-2">
          <LocationSelectList
            locations={locations}
            value={targetId}
            onChange={setTargetId}
            emptyMessage={t('moveDialog.empty', { defaultValue: 'No other {{locations}} available', locations: term.locations })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={() => { if (targetId) onConfirm(targetId); }}
            disabled={!targetId}
          >
            {t('moveDialog.move', { defaultValue: 'Move' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
