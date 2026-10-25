import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useAdminLabels } from './adminUserDetailConstants';
import type { AdminUserActions } from './useAdminUserActions';
import type { AdminUserDetail } from './useAdminUsers';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive';
  onConfirm: () => void;
}

function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, confirmVariant = 'default', onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AdminUserDialogsProps {
  detail: AdminUserDetail;
  actions: AdminUserActions;
}

export function AdminUserDialogs({ detail, actions }: AdminUserDialogsProps) {
  const { t } = useTranslation(['admin', 'common']);
  const labels = useAdminLabels();
  const strong = { strong: <strong /> };
  const email = detail.email ?? '';

  return (
    <>
      <ConfirmDialog
        open={actions.suspendOpen}
        onOpenChange={actions.setSuspendOpen}
        title={t('detail.dialogs.suspendTitle', { defaultValue: 'Suspend User' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.suspendDescription"
            defaults="Suspend <strong>{{email}}</strong>? They will be immediately logged out and unable to access the app."
            values={{ email }}
            components={strong}
          />
        )}
        confirmLabel={t('detail.dialogs.suspendConfirm', { defaultValue: 'Suspend' })}
        confirmVariant="destructive"
        onConfirm={actions.handleSuspend}
      />

      <ConfirmDialog
        open={actions.revokeSessionsOpen}
        onOpenChange={actions.setRevokeSessionsOpen}
        title={t('detail.dialogs.revokeSessionsTitle', { defaultValue: 'Revoke All Sessions' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.revokeSessionsDescription"
            defaults="This will log <strong>{{email}}</strong> out of all devices immediately."
            values={{ email }}
            components={strong}
          />
        )}
        confirmLabel={t('detail.dialogs.revokeSessionsConfirm', { defaultValue: 'Revoke Sessions' })}
        confirmVariant="destructive"
        onConfirm={actions.handleRevokeSessions}
      />

      <ConfirmDialog
        open={actions.revokeKeysOpen}
        onOpenChange={actions.setRevokeKeysOpen}
        title={t('detail.dialogs.revokeKeysTitle', { defaultValue: 'Revoke All API Keys' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.revokeKeysDescription"
            defaults="This will immediately invalidate all API keys for <strong>{{email}}</strong>. Any integrations using these keys will stop working."
            values={{ email }}
            components={strong}
          />
        )}
        confirmLabel={t('detail.dialogs.revokeKeysConfirm', { defaultValue: 'Revoke All Keys' })}
        confirmVariant="destructive"
        onConfirm={actions.handleRevokeAllApiKeys}
      />

      <ConfirmDialog
        open={actions.deleteOpen}
        onOpenChange={actions.setDeleteOpen}
        title={t('detail.dialogs.deleteTitle', { defaultValue: 'Delete User' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.deleteDescription"
            defaults="Permanently delete <strong>{{email}}</strong>? This cannot be undone. All their data will be removed."
            values={{ email }}
            components={strong}
          />
        )}
        confirmLabel={t('detail.dialogs.deleteConfirm', { defaultValue: 'Delete' })}
        confirmVariant="destructive"
        onConfirm={actions.handleDelete}
      />

      <ConfirmDialog
        open={actions.regenKeyOpen}
        onOpenChange={actions.setRegenKeyOpen}
        title={t('detail.dialogs.regenTitle', { defaultValue: 'Regenerate API Key' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.regenDescription"
            defaults="This will revoke all existing API keys for <strong>{{email}}</strong> and create a new one."
            values={{ email }}
            components={strong}
          />
        )}
        confirmLabel={t('detail.dialogs.regenConfirm', { defaultValue: 'Regenerate' })}
        onConfirm={actions.handleRegenerateApiKey}
      />

      <ConfirmDialog
        open={actions.pendingPlan !== null}
        onOpenChange={(open) => { if (!open) actions.setPendingPlan(null); }}
        title={t('detail.dialogs.changePlanTitle', { defaultValue: 'Change Plan' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.changePlanDescription"
            defaults="Change <strong>{{email}}</strong>'s plan from {{from}} to {{to}}?"
            values={{ email, from: labels.plan[detail.plan], to: actions.pendingPlan ? labels.plan[actions.pendingPlan] : '' }}
            components={strong}
          />
        )}
        confirmLabel={t('common:actions.confirm', { defaultValue: 'Confirm' })}
        onConfirm={actions.confirmPlanChange}
      />

      <ConfirmDialog
        open={actions.pendingStatus !== null}
        onOpenChange={(open) => { if (!open) actions.setPendingStatus(null); }}
        title={t('detail.dialogs.changeStatusTitle', { defaultValue: 'Change Subscription Status' })}
        description={(
          <Trans
            t={t}
            i18nKey="detail.dialogs.changeStatusDescription"
            defaults="Change <strong>{{email}}</strong>'s status from {{from}} to {{to}}?"
            values={{ email, from: labels.status[detail.status], to: actions.pendingStatus ? labels.status[actions.pendingStatus] : '' }}
            components={strong}
          />
        )}
        confirmLabel={t('common:actions.confirm', { defaultValue: 'Confirm' })}
        onConfirm={actions.confirmStatusChange}
      />

      <Dialog open={actions.editOpen} onOpenChange={(open) => !open && actions.setEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detail.dialogs.editTitle', { defaultValue: 'Edit User' })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={actions.handleEdit} className="space-y-5">
            <FormField label={t('detail.dialogs.displayNameLabel', { defaultValue: 'Display Name' })} htmlFor="edit-displayName">
              <Input
                id="edit-displayName"
                value={actions.editForm.displayName}
                onChange={(e) => actions.setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </FormField>
            <FormField label={t('detail.dialogs.emailLabel', { defaultValue: 'Email' })} htmlFor="edit-email">
              <Input
                id="edit-email"
                type="email"
                value={actions.editForm.email}
                onChange={(e) => actions.setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </FormField>
            <FormField label={t('detail.dialogs.newPasswordLabel', { defaultValue: 'New Password' })} htmlFor="edit-password">
              <Input
                id="edit-password"
                type="password"
                value={actions.editForm.password}
                onChange={(e) => actions.setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={t('detail.dialogs.newPasswordPlaceholder', { defaultValue: 'Leave blank to keep current' })}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => actions.setEditOpen(false)}>
                {t('common:actions.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" disabled={actions.saving}>
                {actions.saving
                  ? t('detail.dialogs.saving', { defaultValue: 'Saving...' })
                  : t('common:actions.save', { defaultValue: 'Save' })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
