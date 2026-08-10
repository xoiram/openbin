import { lazy, Suspense, useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioOption } from '@/components/ui/radio-option';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { usePlan } from '@/lib/usePlan';
import { cn, getErrorMessage } from '@/lib/utils';
import type { CheckoutAction } from '@/types';
import { exportZip } from '../exportImport';

const DELETION_GRACE_PERIOD_DAYS = 30;
const CONFIRM_PHRASE = 'delete my account';

type Step = 'summary' | 'subscription' | 'confirm';
type RefundPolicy = 'none' | 'prorated';

const CheckoutLink = __EE__
  ? lazy(() => import('@/ee/checkoutAction').then(m => ({ default: m.CheckoutLink })))
  : (() => null) as React.FC<{ action: CheckoutAction; className?: string; children: React.ReactNode; target?: '_self' | '_blank' }>;

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Several sentences below are deliberately split into prefix/suffix t() keys
// around a dynamic value (email, plan, dates, CONFIRM_PHRASE) rather than one
// interpolated key — the value must render as its own React node so tests
// asserting on it (or on partial button/label text) keep working. i18next-cli
// lint flags this as "string concatenation"; it's intentional here, not an
// oversight — see docs/i18n.md.
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { user, deleteAccount, activeLocationId } = useAuth();
  const { planInfo, isSelfHosted } = usePlan();
  const { showToast } = useToast();
  const { t } = useTranslation('settings');

  const hasPassword = user?.hasPassword !== false;
  const hasActiveSub =
    !isSelfHosted &&
    !!user &&
    user.plan !== undefined &&
    user.plan !== 'free' &&
    user.subscriptionStatus === 'active';

  const [step, setStep] = useState<Step>('summary');
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicy>('none');
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExportData() {
    if (!activeLocationId || exporting) return;
    setExporting(true);
    try {
      await exportZip(activeLocationId);
      showToast({ message: t('deleteDialog.backupDownloaded', { defaultValue: 'Backup downloaded' }), variant: 'success' });
    } catch (err) {
      showToast({
        message: getErrorMessage(err, t('deleteDialog.backupDownloadFailed', { defaultValue: 'Failed to download backup' })),
        variant: 'error',
      });
    } finally {
      setExporting(false);
    }
  }

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Defer reset slightly so exit animation isn't disturbed
      const id = window.setTimeout(() => {
        setStep('summary');
        setRefundPolicy('none');
        setConfirmText('');
        setPassword('');
        setSubmitting(false);
        setError(null);
      }, 200);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!user) return null;

  const totalSteps = hasActiveSub ? 3 : 2;
  const stepNumber = step === 'summary' ? 1 : step === 'subscription' ? 2 : hasActiveSub ? 3 : 2;

  function goNext() {
    setError(null);
    if (step === 'summary') {
      setStep(hasActiveSub ? 'subscription' : 'confirm');
    } else if (step === 'subscription') {
      setStep('confirm');
    }
  }

  function goBack() {
    setError(null);
    if (step === 'confirm') {
      setStep(hasActiveSub ? 'subscription' : 'summary');
    } else if (step === 'subscription') {
      setStep('summary');
    }
  }

  const confirmTextValid = confirmText === CONFIRM_PHRASE;
  const passwordValid = !hasPassword || password.length > 0;
  const canSubmit = confirmTextValid && passwordValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await deleteAccount(
        hasPassword ? password : undefined,
        refundPolicy,
      );
      showToast({
        message: result.scheduledAt
          ? t('deleteDialog.deleteScheduledToast', {
              defaultValue: 'Account scheduled for deletion on {{date}}',
              date: new Date(result.scheduledAt).toLocaleDateString(),
            })
          : t('deleteDialog.accountDeletedToast', { defaultValue: 'Account deleted' }),
        variant: 'success',
      });
      // auth state already cleared by deleteAccount
    } catch (err) {
      setError(getErrorMessage(err, t('deleteDialog.deleteFailedToast', { defaultValue: 'Failed to delete account' })));
      setSubmitting(false);
    }
  }

  const planLabel = user.plan ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1) : '';
  const periodLabel = planInfo?.billingPeriod ?? 'quarterly';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 mb-1">
            <DialogTitle>
              {step === 'summary' && t('deleteDialog.titleSummary', { defaultValue: 'Delete Account' })}
              {step === 'subscription' && t('deleteDialog.titleSubscription', { defaultValue: 'Cancel Subscription' })}
              {step === 'confirm' && t('deleteDialog.titleConfirm', { defaultValue: 'Confirm Account Deletion' })}
            </DialogTitle>
            <span className="text-[12px] text-[var(--text-tertiary)] shrink-0">
              {t('deleteDialog.stepPrefix', { defaultValue: 'Step' })} {stepNumber} {t('deleteDialog.stepOf', { defaultValue: 'of' })} {totalSteps}
            </span>
          </div>
          {step === 'summary' && (
            <DialogDescription>
              {t('deleteDialog.descSummaryPrefix', { defaultValue: "You're about to delete" })}{' '}
              <span className="font-medium text-[var(--text-secondary)]">{user.email}</span>.
            </DialogDescription>
          )}
          {step === 'subscription' && (
            <DialogDescription>
              {t('deleteDialog.descSubscription', { defaultValue: 'Choose how to handle your active subscription.' })}
            </DialogDescription>
          )}
          {step === 'confirm' && (
            <DialogDescription>
              {t('deleteDialog.descConfirm', {
                defaultValue: 'This action will be irreversible after the {{days}}-day recovery window.',
                days: DELETION_GRACE_PERIOD_DAYS,
              })}
            </DialogDescription>
          )}
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="mb-4 px-3.5 py-2.5 rounded-[var(--radius-md)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[13px] text-[var(--destructive)]"
          >
            {error}
          </div>
        )}

        {step === 'summary' && (
          <div className="space-y-4">
            <div className="space-y-2 text-[14px] text-[var(--text-secondary)]">
              <p>
                {t('deleteDialog.willDeleteIntroPrefix', { defaultValue: 'This will permanently delete your account in' })}{' '}
                <span className="font-medium text-[var(--text-primary)]">
                  {DELETION_GRACE_PERIOD_DAYS} {t('deleteDialog.daysSuffix', { defaultValue: 'days' })}
                </span>.
              </p>
              <p>{t('deleteDialog.recoverHint', { defaultValue: 'You can recover your account by signing in until then.' })}</p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-[var(--text-primary)] mb-2">
                {t('deleteDialog.whatWillBeDeleted', { defaultValue: 'What will be deleted:' })}
              </p>
              <ul className="text-[13px] text-[var(--text-secondary)] list-disc pl-5 space-y-1">
                <li>{t('deleteDialog.deleteBullet1', { defaultValue: 'All bins and items in locations where you are the only member' })}</li>
                <li>{t('deleteDialog.deleteBullet2', { defaultValue: 'All photos and attachments you uploaded' })}</li>
                <li>{t('deleteDialog.deleteBullet3', { defaultValue: 'Your API keys and personal settings' })}</li>
                <li>{t('deleteDialog.deleteBullet4', { defaultValue: 'Locations shared with others will be preserved' })}</li>
              </ul>
              <div className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleExportData}
                  disabled={exporting || !activeLocationId}
                  className="text-sm"
                >
                  {exporting
                    ? t('deleteDialog.downloadingButton', { defaultValue: 'Downloading…' })
                    : t('deleteDialog.downloadDataButton', { defaultValue: '↓ Download my data first' })}
                </Button>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  {t('deleteDialog.downloadDataHint', { defaultValue: 'Get a copy of your bins, items, photos, and tags before deleting.' })}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('deleteDialog.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="button" variant="destructive" onClick={goNext}>
                {t('deleteDialog.continue', { defaultValue: 'Continue' })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'subscription' && (
          <div className="space-y-4">
            <p className="text-[14px] text-[var(--text-secondary)]">
              {t('deleteDialog.activeSubPrefix', { defaultValue: 'You have an active' })}{' '}
              <span className="font-medium text-[var(--text-primary)]">{planLabel}</span>{' '}
              {t('deleteDialog.activeSubMiddle', { defaultValue: 'subscription billing' })}{' '}
              <span className="font-medium text-[var(--text-primary)]">{periodLabel}</span>.
            </p>
            <div className="space-y-2">
              <RadioOption
                selected={refundPolicy === 'none'}
                onClick={() => setRefundPolicy('none')}
                label={t('deleteDialog.cancelStopBillingNow', { defaultValue: 'Cancel and stop billing now' })}
                description={t('deleteDialog.cancelStopBillingDesc', { defaultValue: 'No refund for the unused time.' })}
              />
              <RadioOption
                selected={refundPolicy === 'prorated'}
                onClick={() => setRefundPolicy('prorated')}
                label={t('deleteDialog.cancelRefundUnused', { defaultValue: 'Cancel and refund the unused time' })}
                description={t('deleteDialog.cancelRefundUnusedDesc', {
                  defaultValue: 'A prorated refund will be issued for the remainder of the billing period.',
                })}
              />
            </div>
            {planInfo?.portalAction && __EE__ && (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                {t('deleteDialog.orJustPrefix', { defaultValue: 'Or just' })}{' '}
                <Suspense fallback={<span>{t('deleteDialog.cancelSubscriptionLink', { defaultValue: 'cancel your subscription' })}</span>}>
                  <CheckoutLink
                    action={planInfo.portalAction}
                    target="_blank"
                    className="text-[var(--accent)] hover:underline"
                  >
                    {t('deleteDialog.cancelSubscriptionLink', { defaultValue: 'cancel your subscription' })}
                  </CheckoutLink>
                </Suspense>{' '}
                {t('deleteDialog.withoutDeletingSuffix', { defaultValue: 'without deleting your account.' })}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={goBack}>
                {t('deleteDialog.back', { defaultValue: 'Back' })}
              </Button>
              <Button type="button" variant="destructive" onClick={goNext}>
                {t('deleteDialog.continue', { defaultValue: 'Continue' })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-phrase">
                {t('deleteDialog.typeToConfirmPrefix', { defaultValue: 'Type' })}{' '}
                <span className="font-mono text-[var(--text-primary)]">{CONFIRM_PHRASE}</span>{' '}
                {t('deleteDialog.typeToConfirmSuffix', { defaultValue: 'to confirm' })}
              </Label>
              <Input
                id="confirm-phrase"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                placeholder={CONFIRM_PHRASE}
                aria-invalid={confirmText.length > 0 && !confirmTextValid}
              />
            </div>
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  {t('deleteDialog.enterPasswordLabel', { defaultValue: 'Enter your password' })}
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder={t('deleteDialog.passwordPlaceholder', { defaultValue: 'Password' })}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={goBack} disabled={submitting}>
                {t('deleteDialog.back', { defaultValue: 'Back' })}
              </Button>
              <Button type="submit" variant="destructive" disabled={!canSubmit}>
                {submitting
                  ? t('deleteDialog.deletingButton', { defaultValue: 'Deleting...' })
                  : t('deleteDialog.deleteAccountButton', { defaultValue: 'Delete Account' })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DeletionPendingBannerProps {
  scheduledAt: string;
}

export function DeletionPendingBanner({ scheduledAt }: DeletionPendingBannerProps) {
  const { t } = useTranslation('settings');
  const date = new Date(scheduledAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <output
      className={cn(
        'block mb-4 px-4 py-3 rounded-[var(--radius-md)]',
        'bg-[var(--destructive)]/8 border border-[var(--destructive)]/30',
        'text-[13px] text-[var(--text-secondary)]',
      )}
    >
      <p className="font-medium text-[var(--destructive)] mb-1">
        {t('deleteDialog.pendingBannerTitle', { defaultValue: 'Account scheduled for deletion' })}
      </p>
      <p>
        {t('deleteDialog.pendingBannerBodyPrefix', { defaultValue: 'Your account is scheduled for deletion on' })}{' '}
        <span className="font-medium text-[var(--text-primary)]">{date}</span>.{' '}
        {t('deleteDialog.pendingBannerBodySuffix', { defaultValue: 'Sign back in before then to recover it.' })}
      </p>
    </output>
  );
}
