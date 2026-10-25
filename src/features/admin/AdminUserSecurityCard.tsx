import { KeyRound, LogOut, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type { AdminUserActions } from './useAdminUserActions';
import type { AdminUserDetail } from './useAdminUsers';

interface AdminUserSecurityCardProps {
  detail: AdminUserDetail;
  isSelf: boolean;
  actions: AdminUserActions;
}

export function AdminUserSecurityCard({ detail, isSelf, actions }: AdminUserSecurityCardProps) {
  const { t, i18n } = useTranslation('admin');
  return (
    <Card>
      <CardHeader><CardTitle>{t('detail.security.title', { defaultValue: 'Security' })}</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
          <div className="row-spread py-3 first:pt-0">
            <div>
              <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.security.accountStatus', { defaultValue: 'Account status' })}</span>
              {detail.suspendedAt && (
                <p className="text-[12px] text-[var(--destructive)]">
                  {t('detail.security.suspendedAt', {
                    defaultValue: 'Suspended {{date}}',
                    date: new Date(detail.suspendedAt).toLocaleString(i18n.language),
                  })}
                </p>
              )}
            </div>
            {detail.suspendedAt ? (
              <Button variant="outline" size="sm" onClick={actions.handleReactivate}>{t('detail.security.reactivate', { defaultValue: 'Reactivate' })}</Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.setSuspendOpen(true)}
                disabled={isSelf}
                className="text-[var(--destructive)] hover:text-[var(--destructive)]"
              >
                <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                {t('detail.security.suspend', { defaultValue: 'Suspend' })}
              </Button>
            )}
          </div>

          <div className="row-spread py-3">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.security.revokeAllSessions', { defaultValue: 'Revoke all sessions' })}</span>
            <Button variant="outline" size="sm" onClick={() => actions.setRevokeSessionsOpen(true)}>
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              {t('detail.security.revoke', { defaultValue: 'Revoke' })}
            </Button>
          </div>

          <div className="row-spread py-3">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.security.requirePasswordChange', { defaultValue: 'Require password change' })}</span>
            <Switch
              checked={!!detail.stats.forcePasswordChange}
              onCheckedChange={actions.handleForcePasswordChange}
              disabled={isSelf}
            />
          </div>

          <div className="row-spread py-3 last:pb-0">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.security.revokeAllApiKeys', { defaultValue: 'Revoke all API keys' })}</span>
            <Button variant="outline" size="sm" onClick={() => actions.setRevokeKeysOpen(true)}>
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              {t('detail.security.revokeAll', { defaultValue: 'Revoke All' })}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
