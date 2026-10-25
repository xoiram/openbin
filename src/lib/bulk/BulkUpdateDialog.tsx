import { type ReactNode, useState } from 'react';
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

export interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  selectedIds: string[];
  onApply: (ids: string[]) => Promise<void>;
  onApplied?: () => void;
  applyDisabled?: boolean;
  applyLabel?: string;
  loadingLabel?: string;
  children: ReactNode;
}

export function BulkUpdateDialog({
  open,
  onOpenChange,
  title,
  description,
  selectedIds,
  onApply,
  onApplied,
  applyDisabled = false,
  applyLabel,
  loadingLabel,
  children,
}: BulkUpdateDialogProps) {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(false);

  async function handleApply() {
    setLoading(true);
    try {
      await onApply(selectedIds);
      onOpenChange(false);
      onApplied?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleApply} disabled={loading || applyDisabled}>
            {loading
              ? loadingLabel ?? t('bulk.applying', { defaultValue: 'Applying...' })
              : applyLabel ?? t('bulk.apply', { defaultValue: 'Apply' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
