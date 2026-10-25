import { KeyRound, Mail, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { OptionGroup } from '@/components/ui/option-group';
import { Switch } from '@/components/ui/switch';
import { isPendingDeletion, useAdminLabels } from './adminUserDetailConstants';
import type { AdminUserActions } from './useAdminUserActions';
import type { AdminUserDetail } from './useAdminUsers';

interface AdminUserActionsCardProps {
  detail: AdminUserDetail;
  isSelf: boolean;
  adminDisabled: boolean;
  showCloudControls: boolean;
  actions: AdminUserActions;
}

export function AdminUserActionsCard({ detail, isSelf, adminDisabled, showCloudControls, actions }: AdminUserActionsCardProps) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const labels = useAdminLabels();
  const showRecoverRow = isPendingDeletion(detail);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.actions.title', { defaultValue: 'Actions' })}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
          <div className="row-spread py-3 first:pt-0">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.adminRole', { defaultValue: 'Admin role' })}</span>
            <Switch
              checked={detail.isAdmin}
              onCheckedChange={actions.handleToggleAdmin}
              disabled={adminDisabled}
            />
          </div>

          <div className="row-spread py-3">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.editDetails', { defaultValue: 'Edit details' })}</span>
            <Button variant="outline" size="sm" onClick={actions.openEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {t('detail.actions.edit', { defaultValue: 'Edit' })}
            </Button>
          </div>

          {showCloudControls && (
            <div className="row-spread py-3">
              <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.planTier', { defaultValue: 'Plan tier' })}</span>
              <OptionGroup
                options={labels.planOptions}
                value={detail.plan}
                onChange={actions.handlePlanChange}
                size="sm"
              />
            </div>
          )}

          {showCloudControls && (
            <div className="row-spread py-3">
              <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.subscription', { defaultValue: 'Subscription' })}</span>
              <OptionGroup
                options={labels.statusOptions}
                value={detail.status}
                onChange={actions.handleStatusChange}
                size="sm"
              />
            </div>
          )}

          {showCloudControls && (
            <div className="row-spread py-3">
              <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.activeUntil', { defaultValue: 'Active until' })}</span>
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={actions.activeUntilInput}
                  onChange={(e) => actions.setActiveUntilInput(e.target.value)}
                  className="w-auto text-[14px] h-8"
                />
                {actions.activeUntilDirty && (
                  <Button size="sm" onClick={actions.handleSaveActiveUntil}>{t('common:actions.save', { defaultValue: 'Save' })}</Button>
                )}
              </div>
            </div>
          )}

          <div className="row-spread py-3">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.regenerateApiKey', { defaultValue: 'Regenerate API key' })}</span>
            <Button variant="outline" size="sm" onClick={() => actions.setRegenKeyOpen(true)}>
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              {t('detail.actions.regenerate', { defaultValue: 'Regenerate' })}
            </Button>
          </div>

          <div className="row-spread py-3">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.sendPasswordReset', { defaultValue: 'Send password reset' })}</span>
            <Button variant="outline" size="sm" onClick={actions.handleSendPasswordReset} disabled={!detail.email}>
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              {t('detail.actions.sendReset', { defaultValue: 'Send Reset' })}
            </Button>
          </div>

          {showRecoverRow && detail.deletionScheduledAt && (
            <div className="row-spread py-3">
              <div>
                <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.recoverAccount', { defaultValue: 'Recover account' })}</span>
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  {t('detail.actions.scheduledForDeletion', {
                    defaultValue: 'Scheduled for deletion on {{date}}',
                    date: new Date(detail.deletionScheduledAt).toLocaleString(i18n.language),
                  })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={actions.handleRecoverDeletion}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {t('detail.actions.recover', { defaultValue: 'Recover' })}
              </Button>
            </div>
          )}

          <div className="row-spread py-3 last:pb-0">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.actions.deleteUser', { defaultValue: 'Delete user' })}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.setDeleteOpen(true)}
              disabled={isSelf}
              className="text-[var(--destructive)] hover:text-[var(--destructive)]"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {t('detail.actions.delete', { defaultValue: 'Delete' })}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
