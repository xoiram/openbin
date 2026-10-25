import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/utils';
import { PLAN_CODE, type PlanKey, SUB_STATUS_CODE, type SubStatusKey, useAdminLabels } from './adminUserDetailConstants';
import {
  type AdminUserDetail,
  deleteUser,
  forcePasswordChange,
  reactivateUser,
  recoverUser,
  regenerateApiKey,
  revokeAllApiKeys,
  revokeSessions,
  sendPasswordReset,
  suspendUser,
  updateUser,
} from './useAdminUsers';

interface UseAdminUserActionsOptions {
  detail: AdminUserDetail | null;
  refresh: () => void;
  refreshAdminCount: () => void;
}

interface RunActionOpts<T> {
  success: string | ((result: T) => string);
  error: string;
  refreshDetail?: boolean;
  refreshAdmin?: boolean;
  after?: () => void;
}

function formatActiveUntilForInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16) : '';
}

export function useAdminUserActions({ detail, refresh, refreshAdminCount }: UseAdminUserActionsOptions) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useTranslation('admin');
  const labels = useAdminLabels();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenKeyOpen, setRegenKeyOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [revokeSessionsOpen, setRevokeSessionsOpen] = useState(false);
  const [revokeKeysOpen, setRevokeKeysOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);
  const [pendingStatus, setPendingStatus] = useState<SubStatusKey | null>(null);
  const [editForm, setEditForm] = useState({ email: '', displayName: '', password: '' });
  const [activeUntilInput, setActiveUntilInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setActiveUntilInput(formatActiveUntilForInput(detail?.activeUntil));
  }, [detail?.activeUntil]);

  const activeUntilDirty = activeUntilInput !== formatActiveUntilForInput(detail?.activeUntil);

  const runAction = useCallback(async <T>(fn: () => Promise<T>, opts: RunActionOpts<T>) => {
    if (!detail) return;
    try {
      const result = await fn();
      const message = typeof opts.success === 'function' ? opts.success(result) : opts.success;
      showToast({ message, variant: 'success' });
      if (opts.refreshDetail !== false) refresh();
      if (opts.refreshAdmin) refreshAdminCount();
      opts.after?.();
    } catch (err) {
      showToast({ message: getErrorMessage(err, opts.error), variant: 'error' });
    }
  }, [detail, showToast, refresh, refreshAdminCount]);

  const handleSaveActiveUntil = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => updateUser(detail.id, { activeUntil: activeUntilInput ? new Date(activeUntilInput).toISOString() : null }),
      {
        success: t('detail.toasts.activeUntilUpdated', { defaultValue: 'Active until updated' }),
        error: t('detail.toasts.activeUntilFailed', { defaultValue: 'Failed to update active until' }),
      },
    );
  }, [detail, activeUntilInput, runAction, t]);

  const handleToggleAdmin = useCallback(async (isAdmin: boolean) => {
    if (!detail) return;
    await runAction(
      () => updateUser(detail.id, { isAdmin }),
      {
        success: isAdmin
          ? t('detail.toasts.promotedToAdmin', { defaultValue: 'User promoted to admin' })
          : t('detail.toasts.removedFromAdmin', { defaultValue: 'User removed from admin' }),
        error: t('detail.toasts.updateUserFailed', { defaultValue: 'Failed to update user' }),
        refreshAdmin: true,
      },
    );
  }, [detail, runAction, t]);

  const handleDelete = useCallback(async () => {
    if (!detail) return;
    try {
      await deleteUser(detail.id);
      showToast({ message: t('detail.toasts.deleted', { defaultValue: 'User {{email}} deleted', email: detail.email }), variant: 'success' });
      navigate('/admin/users');
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('detail.toasts.deleteFailed', { defaultValue: 'Failed to delete user' })), variant: 'error' });
    }
  }, [detail, showToast, navigate, t]);

  const handlePlanChange = useCallback((newPlan: PlanKey) => {
    if (!detail || newPlan === detail.plan) return;
    setPendingPlan(newPlan);
  }, [detail]);

  const confirmPlanChange = useCallback(async () => {
    if (!detail || !pendingPlan) return;
    await runAction(
      () => updateUser(detail.id, { plan: PLAN_CODE[pendingPlan] }),
      {
        success: t('detail.toasts.planChanged', { defaultValue: 'Plan changed to {{plan}}', plan: labels.plan[pendingPlan] }),
        error: t('detail.toasts.planFailed', { defaultValue: 'Failed to update plan' }),
      },
    );
    setPendingPlan(null);
  }, [detail, pendingPlan, runAction, t, labels]);

  const handleStatusChange = useCallback((newStatus: SubStatusKey) => {
    if (!detail || newStatus === detail.status) return;
    setPendingStatus(newStatus);
  }, [detail]);

  const confirmStatusChange = useCallback(async () => {
    if (!detail || !pendingStatus) return;
    await runAction(
      () => updateUser(detail.id, { subStatus: SUB_STATUS_CODE[pendingStatus] }),
      {
        success: t('detail.toasts.statusChanged', { defaultValue: 'Status changed to {{status}}', status: labels.status[pendingStatus] }),
        error: t('detail.toasts.statusFailed', { defaultValue: 'Failed to update status' }),
      },
    );
    setPendingStatus(null);
  }, [detail, pendingStatus, runAction, t, labels]);

  const openEdit = useCallback(() => {
    if (!detail) return;
    setEditForm({ email: detail.email || '', displayName: detail.displayName || '', password: '' });
    setEditOpen(true);
  }, [detail]);

  const handleEdit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const body: Record<string, string> = {};
    if (editForm.email !== (detail.email || '')) body.email = editForm.email;
    if (editForm.displayName !== (detail.displayName || '')) body.displayName = editForm.displayName;
    if (editForm.password) body.password = editForm.password;
    if (Object.keys(body).length === 0) { setEditOpen(false); return; }
    setSaving(true);
    try {
      await updateUser(detail.id, body);
      showToast({ message: t('detail.toasts.userUpdated', { defaultValue: 'User updated' }), variant: 'success' });
      refresh();
      setEditOpen(false);
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('detail.toasts.updateUserFailed', { defaultValue: 'Failed to update user' })), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }, [detail, editForm, showToast, refresh, t]);

  const handleRegenerateApiKey = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => regenerateApiKey(detail.id),
      {
        success: (result) => t('detail.toasts.newApiKey', { defaultValue: 'New API key: {{prefix}}...', prefix: result.keyPrefix }),
        error: t('detail.toasts.regenFailed', { defaultValue: 'Failed to regenerate API key' }),
        after: () => setRegenKeyOpen(false),
      },
    );
  }, [detail, runAction, t]);

  const handleSendPasswordReset = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => sendPasswordReset(detail.id),
      {
        success: t('detail.toasts.passwordResetSent', { defaultValue: 'Password reset email sent' }),
        error: t('detail.toasts.passwordResetFailed', { defaultValue: 'Failed to send password reset' }),
        refreshDetail: false,
      },
    );
  }, [detail, runAction, t]);

  const handleSuspend = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => suspendUser(detail.id),
      {
        success: t('detail.toasts.suspended', { defaultValue: 'User {{email}} suspended', email: detail.email }),
        error: t('detail.toasts.suspendFailed', { defaultValue: 'Failed to suspend user' }),
        after: () => setSuspendOpen(false),
      },
    );
  }, [detail, runAction, t]);

  const handleRecoverDeletion = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => recoverUser(detail.id),
      { success: t('detail.toasts.recovered', { defaultValue: 'User recovered' }), error: t('detail.toasts.recoverFailed', { defaultValue: 'Failed to recover user' }) },
    );
  }, [detail, runAction, t]);

  const handleReactivate = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => reactivateUser(detail.id),
      {
        success: t('detail.toasts.reactivated', { defaultValue: 'User {{email}} reactivated', email: detail.email }),
        error: t('detail.toasts.reactivateFailed', { defaultValue: 'Failed to reactivate user' }),
      },
    );
  }, [detail, runAction, t]);

  const handleRevokeSessions = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => revokeSessions(detail.id),
      {
        success: t('detail.toasts.sessionsRevoked', { defaultValue: 'All sessions revoked' }),
        error: t('detail.toasts.sessionsRevokeFailed', { defaultValue: 'Failed to revoke sessions' }),
        refreshDetail: false,
        after: () => setRevokeSessionsOpen(false),
      },
    );
  }, [detail, runAction, t]);

  const handleRevokeAllApiKeys = useCallback(async () => {
    if (!detail) return;
    await runAction(
      () => revokeAllApiKeys(detail.id),
      {
        success: (result) =>
          t('detail.toasts.apiKeysRevoked', {
            count: result.count,
            defaultValue_one: '{{count}} API key revoked',
            defaultValue_other: '{{count}} API keys revoked',
          }),
        error: t('detail.toasts.apiKeysRevokeFailed', { defaultValue: 'Failed to revoke API keys' }),
        after: () => setRevokeKeysOpen(false),
      },
    );
  }, [detail, runAction, t]);

  const handleForcePasswordChange = useCallback(async (checked: boolean) => {
    if (!detail) return;
    await runAction(
      () => forcePasswordChange(detail.id, checked),
      {
        success: checked
          ? t('detail.toasts.passwordChangeRequired', { defaultValue: 'Password change required' })
          : t('detail.toasts.passwordChangeCleared', { defaultValue: 'Password change cleared' }),
        error: t('detail.toasts.genericUpdateFailed', { defaultValue: 'Failed to update' }),
      },
    );
  }, [detail, runAction, t]);

  return {
    deleteOpen,
    setDeleteOpen,
    regenKeyOpen,
    setRegenKeyOpen,
    suspendOpen,
    setSuspendOpen,
    revokeSessionsOpen,
    setRevokeSessionsOpen,
    revokeKeysOpen,
    setRevokeKeysOpen,
    editOpen,
    setEditOpen,
    pendingPlan,
    setPendingPlan,
    pendingStatus,
    setPendingStatus,
    editForm,
    setEditForm,
    activeUntilInput,
    setActiveUntilInput,
    activeUntilDirty,
    saving,
    handleSaveActiveUntil,
    handleToggleAdmin,
    handleDelete,
    handlePlanChange,
    confirmPlanChange,
    handleStatusChange,
    confirmStatusChange,
    openEdit,
    handleEdit,
    handleRegenerateApiKey,
    handleSendPasswordReset,
    handleSuspend,
    handleRecoverDeletion,
    handleReactivate,
    handleRevokeSessions,
    handleRevokeAllApiKeys,
    handleForcePasswordChange,
  };
}

export type AdminUserActions = ReturnType<typeof useAdminUserActions>;
