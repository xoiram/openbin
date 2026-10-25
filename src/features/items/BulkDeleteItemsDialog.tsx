import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BulkDeleteItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => Promise<void>;
}

export function BulkDeleteItemsDialog({ open, onOpenChange, count, onConfirm }: BulkDeleteItemsDialogProps) {
  const { t } = useTranslation(['items', 'common']);
  const [loading, setLoading] = useState(false);
  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('bulkDelete.title', {
              count,
              defaultValue_one: 'Delete {{count}} item?',
              defaultValue_other: 'Delete {{count}} items?',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('bulkDelete.description', { defaultValue: 'You can undo this immediately after.' })}
          </DialogDescription>
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
