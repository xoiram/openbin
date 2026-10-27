import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ItemEntry } from './useItems';

interface DeleteItemDialogProps {
  entry: ItemEntry | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (entry: ItemEntry) => Promise<void>;
}

/** Confirms deleting one item. Single-item delete is permanent (unlike the undoable bulk delete). */
export function DeleteItemDialog({ entry, onOpenChange, onConfirm }: DeleteItemDialogProps) {
  const { t } = useTranslation(['items', 'common']);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    if (!entry) return;
    setLoading(true);
    try {
      await onConfirm(entry);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('looseItems.delete.title', { defaultValue: 'Delete {{name}}?', name: entry?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('looseItems.delete.description', { defaultValue: 'This cannot be undone.' })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading
              ? t('bulkDelete.submitting', { defaultValue: 'Deleting…' })
              : t('common:actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
