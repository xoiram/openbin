import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type SortDirection, SortHeader } from '@/components/ui/sort-header';
import { Table, TableHeader, TableRow } from '@/components/ui/table';
import { cn, relativeTime } from '@/lib/utils';
import { useAdminLabels } from './adminUserDetailConstants';
import type { AdminFieldKey } from './useAdminColumnVisibility';
import { type AdminUser, statusVariant } from './useAdminUsers';

function pctColor(pct: number): string {
  if (pct > 90) return 'text-[var(--destructive)]';
  if (pct >= 75) return 'text-[var(--color-warning)]';
  return '';
}

interface AdminUsersTableProps {
  users: AdminUser[];
  currentUserId: string;
  sortColumn: string;
  sortDirection: SortDirection;
  onSort: (column: string, direction: SortDirection) => void;
  onDelete: (user: AdminUser) => void;
  onClickUser: (id: string) => void;
  isVisible: (field: AdminFieldKey) => boolean;
}

export function AdminUsersTable({
  users,
  currentUserId,
  sortColumn,
  sortDirection,
  onSort,
  onDelete,
  onClickUser,
  isVisible,
}: AdminUsersTableProps) {
  const { t, i18n } = useTranslation('admin');
  const labels = useAdminLabels();
  return (
    <Table>
      <TableHeader>
        <div className="flex-1 min-w-0">
          <SortHeader label={t('columns.user', { defaultValue: 'User' })} column="email" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} />
        </div>
        {isVisible('email') && (
          <div className="hidden lg:block w-40">
            <SortHeader label={t('columns.email', { defaultValue: 'Email' })} column="email" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} />
          </div>
        )}
        {isVisible('role') && (
          <div className="w-16">
            <span className="ui-col-header">{t('columns.role', { defaultValue: 'Role' })}</span>
          </div>
        )}
        <div className="w-16">
          <SortHeader label={t('columns.plan', { defaultValue: 'Plan' })} column="plan" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} />
        </div>
        <div className="w-24">
          <SortHeader label={t('columns.status', { defaultValue: 'Status' })} column="status" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} />
        </div>
        {isVisible('bins') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.binsShort', { defaultValue: 'Bins' })} column="bins" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('locations') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.locationsShort', { defaultValue: 'Locs' })} column="locations" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('storage') && (
          <div className="hidden lg:block w-20 text-right">
            <SortHeader label={t('columns.storage', { defaultValue: 'Storage' })} column="storage" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('lastActive') && (
          <div className="hidden sm:block w-24">
            <SortHeader label={t('columns.lastActive', { defaultValue: 'Last Active' })} column="lastActive" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} />
          </div>
        )}
        {isVisible('items') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.items', { defaultValue: 'Items' })} column="items" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('photos') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.photos', { defaultValue: 'Photos' })} column="photos" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('scans30d') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.scansShort', { defaultValue: 'Scans' })} column="scans30d" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('aiCredits') && (
          <div className="hidden lg:block w-20 text-right">
            <SortHeader label={t('columns.aiCredits', { defaultValue: 'AI Credits' })} column="aiCredits" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('apiKeys') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.apiKeysShort', { defaultValue: 'Keys' })} column="apiKeys" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('apiRequests7d') && (
          <div className="hidden lg:block w-20 text-right">
            <SortHeader label={t('columns.apiRequestsShort', { defaultValue: 'Reqs (7d)' })} column="apiRequests7d" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('binPct') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.binPct', { defaultValue: 'Bin %' })} column="binPct" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('storagePct') && (
          <div className="hidden lg:block w-20 text-right">
            <SortHeader label={t('columns.storagePctShort', { defaultValue: 'Stor %' })} column="storagePct" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('binsCreated7d') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.binsCreatedShort', { defaultValue: 'New (7d)' })} column="binsCreated7d" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('accountAge') && (
          <div className="hidden lg:block w-14 text-right">
            <SortHeader label={t('columns.accountAge', { defaultValue: 'Age' })} column="accountAge" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} defaultDirection="desc" className="justify-end" />
          </div>
        )}
        {isVisible('created') && (
          <div className="hidden sm:block w-24">
            <SortHeader label={t('columns.created', { defaultValue: 'Created' })} column="created" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSort} />
          </div>
        )}
        <div className="w-9" />
      </TableHeader>

      {users.map((u) => {
        const isSelf = u.id === currentUserId;
        const binPct = u.binLimit !== null && u.binLimit > 0
          ? Math.round((u.binCount / u.binLimit) * 100)
          : null;
        const storagePct = u.storageLimit !== null && u.storageLimit > 0
          ? Math.round((u.photoStorageMb / u.storageLimit) * 100)
          : null;
        const accountAge = Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000);

        return (
          <TableRow
            key={u.id}
            onClick={() => onClickUser(u.id)}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onClickUser(u.id); }}
            className={cn((u.deletedAt || u.suspendedAt) && 'opacity-50')}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[14px] text-[var(--text-primary)] truncate">{u.displayName || u.email}</div>
              <div className="text-[12px] text-[var(--text-tertiary)] truncate">{u.email}</div>
            </div>
            {isVisible('email') && (
              <div className="hidden lg:block w-40 text-[14px] text-[var(--text-secondary)] truncate">{u.email || '—'}</div>
            )}
            {isVisible('role') && (
              <div className="w-16 text-[14px]">
                {u.isAdmin ? <Badge variant="default" className="text-[11px]">{t('badges.admin', { defaultValue: 'Admin' })}</Badge> : <span className="text-[var(--text-tertiary)]">—</span>}
              </div>
            )}
            <div className="w-16 text-[14px]">
              <Badge variant="secondary" className="text-[11px]">{labels.plan[u.plan]}</Badge>
            </div>
            <div className="w-24 text-[14px]">
              <span className="flex items-center gap-1.5">
                {u.deletionScheduledAt && new Date(u.deletionScheduledAt).getTime() > Date.now() ? (
                  <Badge className="text-[11px] bg-[var(--color-warning-soft)] text-[var(--color-warning)]">{t('badges.deletionPending', { defaultValue: 'Deletion pending' })}</Badge>
                ) : u.deletedAt ? (
                  <Badge variant="destructive" className="text-[11px]">{t('badges.deleted', { defaultValue: 'Deleted' })}</Badge>
                ) : null}
                {u.suspendedAt && <Badge variant="destructive" className="text-[11px]">{t('badges.suspended', { defaultValue: 'Suspended' })}</Badge>}
                <Badge variant={statusVariant(u.status)} className="text-[11px]">{labels.status[u.status]}</Badge>
              </span>
            </div>
            {isVisible('bins') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.binCount}</div>
            )}
            {isVisible('locations') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.locationCount}</div>
            )}
            {isVisible('storage') && (
              <div className="hidden lg:block w-20 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : t('users.storageMb', { defaultValue: '{{mb}} MB', mb: u.photoStorageMb })}</div>
            )}
            {isVisible('lastActive') && (
              <div className="hidden sm:block w-24">
                <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">
                  {u.deletedAt ? '—' : relativeTime(u.lastActiveAt)}
                </span>
              </div>
            )}
            {isVisible('items') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.itemCount}</div>
            )}
            {isVisible('photos') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.photoCount}</div>
            )}
            {isVisible('scans30d') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.scans30d}</div>
            )}
            {isVisible('aiCredits') && (
              <div className="hidden lg:block w-20 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">
                {u.deletedAt || u.aiCreditsLimit === 0 ? '—' : `${u.aiCreditsUsed}/${u.aiCreditsLimit}`}
              </div>
            )}
            {isVisible('apiKeys') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.apiKeyCount}</div>
            )}
            {isVisible('apiRequests7d') && (
              <div className="hidden lg:block w-20 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.apiRequests7d}</div>
            )}
            {isVisible('binPct') && (
              <div className={cn('hidden lg:block w-14 text-[14px] text-right tabular-nums', binPct !== null ? pctColor(binPct) : 'text-[var(--text-secondary)]')}>
                {u.deletedAt || binPct === null ? '—' : `${binPct}%`}
              </div>
            )}
            {isVisible('storagePct') && (
              <div className={cn('hidden lg:block w-20 text-[14px] text-right tabular-nums', storagePct !== null ? pctColor(storagePct) : 'text-[var(--text-secondary)]')}>
                {u.deletedAt || storagePct === null ? '—' : `${storagePct}%`}
              </div>
            )}
            {isVisible('binsCreated7d') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : u.binsCreated7d}</div>
            )}
            {isVisible('accountAge') && (
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] text-right tabular-nums">{u.deletedAt ? '—' : t('users.accountAgeDays', { defaultValue: '{{days}}d', days: accountAge })}</div>
            )}
            {isVisible('created') && (
              <div className="hidden sm:block w-24">
                <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString(i18n.language)}</span>
              </div>
            )}
            <div className="w-9 flex justify-center">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => { e.stopPropagation(); onDelete(u); }}
                disabled={isSelf}
                aria-label={t('users.deleteUserAria', { defaultValue: 'Delete {{email}}', email: u.email })}
                className="text-[var(--destructive)] hover:text-[var(--destructive)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TableRow>
        );
      })}
    </Table>
  );
}
