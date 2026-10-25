import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTerminology } from '@/lib/terminology';

interface DeleteBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binName: string;
  onConfirm: () => void | Promise<void>;
}

export function DeleteBinDialog({ open, onOpenChange, binName, onConfirm }: DeleteBinDialogProps) {
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const [deleting, setDeleting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!deleting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteDialog.title', { defaultValue: 'Delete this {{bin}}?', bin: term.bin })}</DialogTitle>
          <DialogDescription>
            {t('deleteDialog.description', { defaultValue: "This will delete '{{name}}' and all its photos. You can undo this action briefly after deletion.", name: binName })}
          </DialogDescription>
        </DialogHeader>
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
            {deleting ? t('deleteDialog.deleting', { defaultValue: 'Deleting\u2026' }) : t('common:actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
