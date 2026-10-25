import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { clearOverrides, fetchOverrides, grantAiCredits, resetAiCredits, type UserLimitOverrides, updateOverrides } from '@/ee/adminOverrides';
import { getErrorMessage } from '@/lib/utils';
import type { AdminUserDetail } from './useAdminUsers';

interface UseAdminUserOverridesOptions {
  detail: AdminUserDetail | null;
  selfHosted: boolean;
  refresh: () => void;
}

export function useAdminUserOverrides({ detail, selfHosted, refresh }: UseAdminUserOverridesOptions) {
  const { showToast } = useToast();
  const { t } = useTranslation('admin');
  const [overrides, setOverrides] = useState<Partial<UserLimitOverrides>>({});
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [grantAmount, setGrantAmount] = useState('');

  const detailId = detail?.id;
  useEffect(() => {
    if (!detailId || selfHosted) return;
    let ignore = false;
    fetchOverrides(detailId)
      .then((o) => {
        if (!ignore) setOverrides(o);
      })
      .catch((err) => {
        if (!ignore) {
          showToast({ message: getErrorMessage(err, t('detail.toasts.overridesLoadFailed', { defaultValue: 'Failed to load user overrides' })), variant: 'error' });
        }
      });
    return () => {
      ignore = true;
    };
  }, [detailId, selfHosted, showToast, t]);

  const handleSaveOverrides = useCallback(async () => {
    if (!detail) return;
    setSavingOverrides(true);
    try {
      await updateOverrides(detail.id, overrides);
      showToast({ message: t('detail.toasts.overridesSaved', { defaultValue: 'Overrides saved' }), variant: 'success' });
      refresh();
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('detail.toasts.overridesSaveFailed', { defaultValue: 'Failed to save overrides' })), variant: 'error' });
    } finally {
      setSavingOverrides(false);
    }
  }, [detail, overrides, showToast, refresh, t]);

  const handleClearOverrides = useCallback(async () => {
    if (!detail) return;
    try {
      await clearOverrides(detail.id);
      setOverrides({});
      showToast({ message: t('detail.toasts.overridesCleared', { defaultValue: 'Overrides cleared' }), variant: 'success' });
      refresh();
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('detail.toasts.overridesClearFailed', { defaultValue: 'Failed to clear overrides' })), variant: 'error' });
    }
  }, [detail, showToast, refresh, t]);

  const handleGrantCredits = useCallback(async () => {
    if (!detail || !grantAmount) return;
    try {
      await grantAiCredits(detail.id, Number(grantAmount));
      showToast({ message: t('detail.toasts.creditsGranted', {
          count: Number(grantAmount),
          defaultValue_one: '{{count}} AI credit granted',
          defaultValue_other: '{{count}} AI credits granted',
        }), variant: 'success' });
      setGrantAmount('');
      refresh();
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('detail.toasts.creditsGrantFailed', { defaultValue: 'Failed to grant credits' })), variant: 'error' });
    }
  }, [detail, grantAmount, showToast, refresh, t]);

  const handleResetCredits = useCallback(async () => {
    if (!detail) return;
    try {
      await resetAiCredits(detail.id);
      showToast({ message: t('detail.toasts.creditsReset', { defaultValue: 'AI credits reset' }), variant: 'success' });
      refresh();
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('detail.toasts.creditsResetFailed', { defaultValue: 'Failed to reset credits' })), variant: 'error' });
    }
  }, [detail, showToast, refresh, t]);

  return {
    overrides,
    setOverrides,
    savingOverrides,
    grantAmount,
    setGrantAmount,
    handleSaveOverrides,
    handleClearOverrides,
    handleGrantCredits,
    handleResetCredits,
  };
}

export type AdminUserOverrides = ReturnType<typeof useAdminUserOverrides>;
