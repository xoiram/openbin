import { BarChart3, Globe, Lock, Mail, Search, Settings, UserPlus, Users } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OptionGroup } from '@/components/ui/option-group';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import type { SortDirection } from '@/components/ui/sort-header';
import { Switch } from '@/components/ui/switch';
import { Table, TableHeader } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { usePlan } from '@/lib/usePlan';
import { getErrorMessage } from '@/lib/utils';
import { AdminColumnVisibilityMenu } from './AdminColumnVisibilityMenu';
import { AdminUsersTable } from './AdminUsersTable';
import { useAdminColumnVisibility } from './useAdminColumnVisibility';
import { type AdminUser, useAdminUsers } from './useAdminUsers';

const AdminMetricsSection = __EE__
  ? lazy(() => import('@/ee/AdminMetricsSection').then((m) => ({ default: m.AdminMetricsSection })))
  : (() => null) as React.FC;

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const { user } = useAuth();
  const { isSelfHosted } = usePlan();
  const { showToast } = useToast();
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();

  // Redirect non-admins
  useEffect(() => {
    if (user && !user.isAdmin) navigate('/', { replace: true });
  }, [user, navigate]);

  const [tab, setTab] = useState<'users' | 'metrics'>('users');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { visibility, toggleField, isVisible } = useAdminColumnVisibility();
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', displayName: '', isAdmin: false });
  const [createLoading, setCreateLoading] = useState(false);

  const sortParam = `${sortDirection === 'desc' ? '-' : ''}${sortColumn}`;
  const { users, count, isLoading, registration, deleteUser, updateRegistrationMode, createUser } = useAdminUsers(search, page, sortParam);
  const totalPages = Math.ceil(count / PAGE_SIZE);

  const handleSort = useCallback((column: string, direction: SortDirection) => {
    setSortColumn(column);
    setSortDirection(direction);
    setPage(1);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      showToast({ message: t('users.deletedToast', { defaultValue: 'User {{email}} deleted', email: deleteTarget.email }), variant: 'success' });
      setDeleteTarget(null);
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('users.deleteFailed', { defaultValue: 'Failed to delete user' })), variant: 'error' });
    }
  }, [deleteTarget, deleteUser, showToast, t]);

  const registrationLabels = useMemo<Record<'open' | 'invite' | 'closed', string>>(() => ({
    open: t('registration.open', { defaultValue: 'Open' }),
    invite: t('registration.invite', { defaultValue: 'Invite' }),
    closed: t('registration.closed', { defaultValue: 'Closed' }),
  }), [t]);

  const handleRegistrationChange = useCallback(async (mode: 'open' | 'invite' | 'closed') => {
    try {
      await updateRegistrationMode(mode);
      showToast({
        message: t('registration.updatedToast', { defaultValue: 'Registration mode set to {{mode}}', mode: registrationLabels[mode] }),
        variant: 'success',
      });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('registration.updateFailed', { defaultValue: 'Failed to update registration mode' })), variant: 'error' });
    }
  }, [updateRegistrationMode, showToast, t, registrationLabels]);

  const handleCreate = useCallback(async () => {
    setCreateLoading(true);
    try {
      await createUser({
        email: createForm.email,
        password: createForm.password,
        displayName: createForm.displayName || undefined,
        isAdmin: createForm.isAdmin,
      });
      showToast({ message: t('users.createdToast', { defaultValue: 'User {{email}} created', email: createForm.email }), variant: 'success' });
      setCreateOpen(false);
      setCreateForm({ email: '', password: '', displayName: '', isAdmin: false });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('users.createFailed', { defaultValue: 'Failed to create user' })), variant: 'error' });
    } finally {
      setCreateLoading(false);
    }
  }, [createForm, createUser, showToast, t]);

  // Prevent flash of admin content for non-admins
  if (user && !user.isAdmin) return null;

  const lockedTitle = t('registration.lockedShort', { defaultValue: 'Locked by env var' });

  const registrationSection = (
    <Card>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              {registration.locked ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
              {t('registration.title', { defaultValue: 'Registration' })}
            </p>
            {registration.locked && (
              <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">{t('registration.lockedByEnv', { defaultValue: 'Locked by REGISTRATION_MODE env var' })}</p>
            )}
          </div>
          <OptionGroup
            options={[
              { key: 'open' as const, label: registrationLabels.open, icon: UserPlus, disabled: registration.locked, disabledTitle: lockedTitle },
              { key: 'invite' as const, label: registrationLabels.invite, icon: Mail, disabled: registration.locked, disabledTitle: lockedTitle },
              { key: 'closed' as const, label: registrationLabels.closed, icon: Lock, disabled: registration.locked, disabledTitle: lockedTitle },
            ]}
            value={registration.mode}
            onChange={handleRegistrationChange}
          />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="page-content-wide">
      <PageHeader
        title={t('users.pageTitle', { defaultValue: 'Admin' })}
        back
        actions={
          <div className="flex items-center gap-2">
            {__EE__ && !isSelfHosted && (
              <OptionGroup
                options={[
                  { key: 'users' as const, label: t('users.tabUsers', { defaultValue: 'Users' }), icon: Users },
                  { key: 'metrics' as const, label: t('users.tabMetrics', { defaultValue: 'Metrics' }), icon: BarChart3 },
                ]}
                value={tab}
                onChange={setTab}
              />
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/system')}>
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              {t('users.systemButton', { defaultValue: 'System' })}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              {t('users.createUserButton', { defaultValue: 'Create User' })}
            </Button>
          </div>
        }
      />

      {/* Self-hosted: registration + users (no tabs) */}
      {/* Cloud: show tab content */}
      {(isSelfHosted || tab === 'users') && (
        <>
          {/* Registration — self-hosted only shows here (cloud has it in metrics tab) */}
          {isSelfHosted && registrationSection}

          {/* Section label */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--text-secondary)]" />
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">{t('users.sectionTitle', { defaultValue: 'Users' })}</h2>
            <Badge variant="secondary" className="text-[11px]">{count}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <SearchInput
              placeholder={t('users.searchPlaceholder', { defaultValue: 'Search users...' })}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onClear={search ? () => { setSearch(''); setPage(1); } : undefined}
              className="flex-1"
            />
            <AdminColumnVisibilityMenu visibility={visibility} onToggle={toggleField} />
          </div>

          {/* Users table */}
          {isLoading ? (
            <Table>
              <TableHeader>
                <div className="flex-1"><Skeleton className="h-3 w-12" /></div>
                <div className="hidden lg:block w-40"><Skeleton className="h-3 w-12" /></div>
                <div className="w-16"><Skeleton className="h-3 w-8" /></div>
                <div className="w-16"><Skeleton className="h-3 w-8" /></div>
                <div className="w-24"><Skeleton className="h-3 w-10" /></div>
                <div className="hidden lg:block w-14"><Skeleton className="h-3 w-8" /></div>
                <div className="hidden lg:block w-14"><Skeleton className="h-3 w-8" /></div>
                <div className="hidden lg:block w-20"><Skeleton className="h-3 w-10" /></div>
                <div className="hidden sm:block w-24"><Skeleton className="h-3 w-14" /></div>
                <div className="w-9" />
              </TableHeader>
              {Array.from({ length: 8 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="hidden lg:block w-40"><Skeleton className="h-4 w-24" /></div>
                  <div className="w-16"><Skeleton className="h-5 w-12" /></div>
                  <div className="w-16"><Skeleton className="h-5 w-12" /></div>
                  <div className="w-24"><Skeleton className="h-5 w-14" /></div>
                  <div className="hidden lg:block w-14"><Skeleton className="h-4 w-8" /></div>
                  <div className="hidden lg:block w-14"><Skeleton className="h-4 w-8" /></div>
                  <div className="hidden lg:block w-20"><Skeleton className="h-4 w-12" /></div>
                  <div className="hidden sm:block w-24"><Skeleton className="h-3 w-16" /></div>
                  <div className="w-9" />
                </div>
              ))}
            </Table>
          ) : users.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('users.noUsers', { defaultValue: 'No users found' })}
              subtitle={search ? t('users.tryDifferentSearch', { defaultValue: 'Try a different search term' }) : undefined}
              variant="search"
            />
          ) : (
            <AdminUsersTable
              users={users}
              currentUserId={user?.id ?? ''}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              onDelete={setDeleteTarget}
              onClickUser={(id) => navigate(`/admin/users/${id}`)}
              isVisible={isVisible}
            />
          )}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalCount={count}
            pageSize={PAGE_SIZE}
            itemLabel={t('users.paginationLabel', { defaultValue: 'users' })}
          />
        </>
      )}

      {__EE__ && !isSelfHosted && tab === 'metrics' && (
        <>
          {registrationSection}
          <Suspense fallback={null}>
            <AdminMetricsSection />
          </Suspense>
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.deleteDialog.title', { defaultValue: 'Delete User' })}</DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="users.deleteDialog.description"
                defaults="Permanently delete <strong>{{email}}</strong>? This cannot be undone. All their data will be removed."
                values={{ email: deleteTarget?.email ?? '' }}
                components={{ strong: <strong /> }}
              />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('users.deleteDialog.confirm', { defaultValue: 'Delete' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateOpen(false);
          setCreateForm({ email: '', password: '', displayName: '', isAdmin: false });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.createDialog.title', { defaultValue: 'Create User' })}</DialogTitle>
            <DialogDescription>{t('users.createDialog.description', { defaultValue: 'Create a new user account.' })}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-5">
            <FormField label={t('users.createDialog.emailLabel', { defaultValue: 'Email' })} htmlFor="create-email">
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t('users.createDialog.emailPlaceholder', { defaultValue: 'Email' })}
                autoComplete="email"
              />
            </FormField>
            <FormField
              label={t('users.createDialog.passwordLabel', { defaultValue: 'Password' })}
              htmlFor="create-password"
              hint={t('users.createDialog.passwordHint', { defaultValue: '8+ characters, mixed case, one digit' })}
            >
              <Input
                id="create-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={t('users.createDialog.passwordPlaceholder', { defaultValue: 'Password' })}
                autoComplete="new-password"
              />
            </FormField>
            <FormField label={t('users.createDialog.displayNameLabel', { defaultValue: 'Display Name' })} htmlFor="create-displayName">
              <Input
                id="create-displayName"
                value={createForm.displayName}
                onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder={t('users.createDialog.displayNamePlaceholder', { defaultValue: 'Optional' })}
              />
            </FormField>
            <div className="flex items-center gap-2">
              <Switch
                checked={createForm.isAdmin}
                onCheckedChange={(checked) => setCreateForm((f) => ({ ...f, isAdmin: checked }))}
              />
              <Label>{t('users.createDialog.adminLabel', { defaultValue: 'Admin' })}</Label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                {t('common:actions.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" disabled={!createForm.email || !createForm.password || createLoading}>
                {createLoading
                  ? t('users.createDialog.creating', { defaultValue: 'Creating...' })
                  : t('users.createDialog.create', { defaultValue: 'Create' })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
