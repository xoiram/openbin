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

interface BulkReturnOriginalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => Promise<void>;
}

export function BulkReturnOriginalDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: BulkReturnOriginalDialogProps) {
  const { t } = useTranslation(['checkouts', 'common']);
  const [loading, setLoading] = useState(false);
  async function handle() {
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
            {t('bulkReturnOriginal.title', {
              count,
              defaultValue_one: 'Return {{count}} item to its original bin?',
              defaultValue_other: 'Return {{count}} items to their original bins?',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('bulkReturnOriginal.description', {
              defaultValue: 'Each item goes back to where it was checked out from.',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handle} disabled={loading}>
            {loading
              ? t('return.submitting', { defaultValue: 'Returning…' })
              : t('return.submit', { defaultValue: 'Return' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
