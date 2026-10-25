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

interface BulkCheckoutItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => Promise<void>;
}

export function BulkCheckoutItemsDialog({ open, onOpenChange, count, onConfirm }: BulkCheckoutItemsDialogProps) {
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
            {t('bulkCheckout.title', {
              count,
              defaultValue_one: 'Check out {{count}} item?',
              defaultValue_other: 'Check out {{count}} items?',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('bulkCheckout.description', { defaultValue: 'Already-checked-out items will be skipped.' })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading
              ? t('bulkCheckout.submitting', { defaultValue: 'Checking out…' })
              : t('bulkCheckout.submit', { defaultValue: 'Check out' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
