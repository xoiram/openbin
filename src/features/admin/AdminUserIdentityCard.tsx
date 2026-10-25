import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isPendingDeletion, useAdminLabels } from './adminUserDetailConstants';
import { type AdminUserDetail, statusVariant } from './useAdminUsers';

interface AdminUserIdentityCardProps {
  detail: AdminUserDetail;
  showActiveUntil: boolean;
}

export function AdminUserIdentityCard({ detail, showActiveUntil }: AdminUserIdentityCardProps) {
  const { t, i18n } = useTranslation('admin');
  const labels = useAdminLabels();
  const createdAt = new Date(detail.createdAt);
  const showDeletionPending = isPendingDeletion(detail);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.identity.title', { defaultValue: 'Identity' })}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {showDeletionPending ? (
            <Badge className="bg-[var(--color-warning-soft)] text-[var(--color-warning)]">{t('badges.deletionPending', { defaultValue: 'Deletion pending' })}</Badge>
          ) : detail.deletedAt ? (
            <Badge variant="destructive">{t('badges.deleted', { defaultValue: 'Deleted' })}</Badge>
          ) : null}
          {detail.suspendedAt && <Badge variant="destructive">{t('badges.suspended', { defaultValue: 'Suspended' })}</Badge>}
          {detail.isAdmin && <Badge variant="default">{t('badges.admin', { defaultValue: 'Admin' })}</Badge>}
          <Badge variant="secondary">{labels.plan[detail.plan]}</Badge>
          <Badge variant={statusVariant(detail.status)}>{labels.status[detail.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="ui-col-header">{t('detail.identity.email', { defaultValue: 'Email' })}</span>
            <p className="text-[15px] text-[var(--text-primary)]">{detail.email || '—'}</p>
          </div>
          <div>
            <span className="ui-col-header">{t('detail.identity.displayName', { defaultValue: 'Display Name' })}</span>
            <p className="text-[15px] text-[var(--text-primary)]">{detail.displayName || '—'}</p>
          </div>
          {showActiveUntil && (
            <div>
              <span className="ui-col-header">{t('detail.identity.activeUntil', { defaultValue: 'Active Until' })}</span>
              <p className="text-[15px] text-[var(--text-primary)]">{detail.activeUntil ? new Date(detail.activeUntil).toLocaleString(i18n.language) : '—'}</p>
            </div>
          )}
          <div>
            <span className="ui-col-header">{t('detail.identity.created', { defaultValue: 'Created' })}</span>
            <p className="text-[15px] text-[var(--text-primary)]">{createdAt.toLocaleString(i18n.language)}</p>
          </div>
          <div>
            <span className="ui-col-header">{t('detail.identity.updated', { defaultValue: 'Updated' })}</span>
            <p className="text-[15px] text-[var(--text-primary)]">{new Date(detail.updatedAt).toLocaleString(i18n.language)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
