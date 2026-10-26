import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTerminology } from '@/lib/terminology';

interface BulkDeleteBinsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Label for the selection, e.g. "3 bins". */
  selectionLabel: string;
  /** Boxes inside the selected boxes (they go to the trash with their parent). */
  childCount: number;
  onConfirm: () => void | Promise<void>;
}

/** Confirmation for deleting several boxes; says so when boxes inside them are trashed too. */
export function BulkDeleteBinsDialog({ open, onOpenChange, selectionLabel, childCount, onConfirm }: BulkDeleteBinsDialogProps) {
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const [deleting, setDeleting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!deleting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteDialog.title', { defaultValue: 'Delete this {{bin}}?', bin: term.bin })}</DialogTitle>
          <DialogDescription>
            {t('deleteDialog.description', { defaultValue: "This will delete '{{name}}' and all its photos. You can undo this action briefly after deletion.", name: selectionLabel })}
          </DialogDescription>
        </DialogHeader>
        {childCount > 0 && (
          <p className="text-[13px] text-[var(--text-secondary)]" role="note">
            {t('nestedList.deleteWithChildren', {
              count: childCount,
              defaultValue_one: '{{count}} {{bin}} inside them will go to the trash too.',
              defaultValue_other: '{{count}} {{bins}} inside them will go to the trash too.',
              bin: term.bin,
              bins: term.bins,
            })}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? t('deleteDialog.deleting', { defaultValue: 'Deleting…' }) : t('common:actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
