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
import { useAuth } from '@/lib/auth';
import { getErrorMessage } from '@/lib/utils';

export interface RecoverAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  password: string;
  scheduledAt: string;
  onRecovered: () => Promise<void> | void;
}

// The description below is split into prefix/suffix t() keys around
// scheduledDate so the formatted date renders as its own React node — a test
// asserts on the date substring directly. i18next-cli lint flags this as
// "string concatenation"; it's intentional here — see docs/i18n.md.
export function RecoverAccountDialog({
  open,
  onOpenChange,
  email,
  password,
  scheduledAt,
  onRecovered,
}: RecoverAccountDialogProps) {
  const { recoverAccount } = useAuth();
  const { t } = useTranslation('settings');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleRecover() {
    setError('');
    setSubmitting(true);
    try {
      await recoverAccount(email, password);
      onOpenChange(false);
      await onRecovered();
    } catch (err) {
      setError(getErrorMessage(err, t('recoverDialog.recoveryFailedDefault', { defaultValue: 'Recovery failed' })));
    } finally {
      setSubmitting(false);
    }
  }

  const scheduledDate = new Date(scheduledAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('recoverDialog.title', { defaultValue: 'Account scheduled for deletion' })}</DialogTitle>
          <DialogDescription>
            {t('recoverDialog.descPrefix', { defaultValue: 'This account is scheduled for permanent deletion on' })}{' '}
            {scheduledDate}. {t('recoverDialog.descSuffix', { defaultValue: 'Recover it now to continue using your account.' })}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <output role="alert" className="block text-[13px] text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 px-3.5 py-2.5 rounded-[var(--radius-md)]">
            {error}
          </output>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('recoverDialog.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="button" onClick={handleRecover} disabled={submitting}>
            {submitting
              ? t('recoverDialog.recovering', { defaultValue: 'Recovering...' })
              : t('recoverDialog.recoverAccountButton', { defaultValue: 'Recover account' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
