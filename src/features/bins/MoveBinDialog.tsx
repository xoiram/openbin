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
}

export function MoveBinDialog({ open, onOpenChange, binName, locations, onConfirm }: MoveBinDialogProps) {
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
