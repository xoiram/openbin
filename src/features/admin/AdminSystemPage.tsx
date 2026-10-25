import type { TFunction } from 'i18next';
import {
  MapPin,
  Plus,
  Search,
  Server,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { OptionGroup } from '@/components/ui/option-group';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { formatBytes, getErrorMessage, relativeTime } from '@/lib/utils';
import {
  fetchMaintenanceStatus,
  fetchSystemHealth,
  type MaintenanceStatus,
  type SystemHealth,
  toggleMaintenance,
  useAdminLocations,
  useAnnouncements,
  useAuditLog,
  useDeletionDiagnostics,
} from './useAdminSystem';

type Tab = 'system' | 'audit' | 'locations';

const PAGE_SIZE = 25;

function formatUptime(seconds: number, t: TFunction<'admin'>): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t('system.uptimeDays', { defaultValue: '{{days}}d {{hours}}h', days, hours });
  if (hours > 0) return t('system.uptimeHours', { defaultValue: '{{hours}}h {{minutes}}m', hours, minutes });
  return t('system.uptimeMinutes', { defaultValue: '{{minutes}}m', minutes });
}

function HealthCard({ label, value, tone, subtitle }: { label: string; value: string | number; tone?: 'default' | 'warning'; subtitle?: string }) {
  const valueColor = tone === 'warning'
    ? 'text-[var(--color-warning)]'
    : 'text-[var(--text-primary)]';
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-input)]">
      <span className="ui-col-header">{label}</span>
      <span className={`text-[20px] font-bold ${valueColor} leading-tight tabular-nums`}>{value}</span>
      {subtitle && (
        <span className="text-[11px] text-[var(--text-tertiary)]">{subtitle}</span>
      )}
    </div>
  );
}

// ── System Tab ──────────────────────────────────────────────────────

function SystemTab() {
  const { t } = useTranslation('admin');
  const { showToast } = useToast();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [loadingHealth, setLoadingHealth] = useState(true);

  const { diagnostics, isLoading: diagnosticsLoading } = useDeletionDiagnostics();
  const { announcements, isLoading: announcementsLoading, createAnnouncement, deleteAnnouncement } = useAnnouncements();
  const [newBannerOpen, setNewBannerOpen] = useState(false);
  const [bannerForm, setBannerForm] = useState({ text: '', type: 'info' as 'info' | 'warning' | 'critical' });
  const [bannerSaving, setBannerSaving] = useState(false);
  const announcementTypeLabels = useMemo<Record<string, string>>(() => ({
    info: t('system.announcements.types.info', { defaultValue: 'Info' }),
    warning: t('system.announcements.types.warning', { defaultValue: 'Warning' }),
    critical: t('system.announcements.types.critical', { defaultValue: 'Critical' }),
  }), [t]);

  useEffect(() => {
    Promise.all([fetchSystemHealth(), fetchMaintenanceStatus()])
      .then(([h, m]) => {
        setHealth(h);
        setMaintenance(m);
        setMaintenanceMsg(m.message || '');
      })
      .catch((err) => {
        showToast({ message: getErrorMessage(err, t('system.loadFailed', { defaultValue: 'Failed to load system status' })), variant: 'error' });
      })
      .finally(() => setLoadingHealth(false));
  }, [showToast, t]);

  const handleToggleMaintenance = useCallback(async (enabled: boolean) => {
    try {
      const result = await toggleMaintenance(enabled, maintenanceMsg || undefined);
      setMaintenance(result);
      showToast({ message: enabled
          ? t('system.maintenanceEnabled', { defaultValue: 'Maintenance mode enabled' })
          : t('system.maintenanceDisabled', { defaultValue: 'Maintenance mode disabled' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('system.maintenanceFailed', { defaultValue: 'Failed to toggle maintenance' })), variant: 'error' });
    }
  }, [maintenanceMsg, showToast, t]);

  const handleCreateBanner = useCallback(async () => {
    if (!bannerForm.text.trim()) return;
    setBannerSaving(true);
    try {
      await createAnnouncement({ text: bannerForm.text, type: bannerForm.type });
      showToast({ message: t('system.announcements.created', { defaultValue: 'Announcement created' }), variant: 'success' });
      setNewBannerOpen(false);
      setBannerForm({ text: '', type: 'info' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('system.announcements.createFailed', { defaultValue: 'Failed to create announcement' })), variant: 'error' });
    } finally {
      setBannerSaving(false);
    }
  }, [bannerForm, createAnnouncement, showToast, t]);

  const handleDeleteBanner = useCallback(async (id: string) => {
    try {
      await deleteAnnouncement(id);
      showToast({ message: t('system.announcements.deleted', { defaultValue: 'Announcement deleted' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('system.announcements.deleteFailed', { defaultValue: 'Failed to delete announcement' })), variant: 'error' });
    }
  }, [deleteAnnouncement, showToast, t]);

  if (loadingHealth) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
              <div key={i} className="flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-input)]">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Health */}
      {health && (
        <Card>
          <CardHeader><CardTitle>{t('system.health.title', { defaultValue: 'System Health' })}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              <HealthCard label={t('system.health.dbSize', { defaultValue: 'DB Size' })} value={formatBytes(health.dbSizeBytes)} />
              <HealthCard label={t('system.health.totalUsers', { defaultValue: 'Total Users' })} value={health.userCount.total} />
              <HealthCard label={t('system.health.activeUsers', { defaultValue: 'Active Users' })} value={health.userCount.active} />
              <HealthCard label={t('system.health.deletedUsers', { defaultValue: 'Deleted Users' })} value={health.userCount.deleted} />
              <HealthCard label={t('system.health.suspendedUsers', { defaultValue: 'Suspended Users' })} value={health.userCount.suspended} />
              <HealthCard label={t('system.health.activeSessions', { defaultValue: 'Active Sessions' })} value={health.activeSessions} />
              <HealthCard label={t('system.health.uptime', { defaultValue: 'Uptime' })} value={formatUptime(health.uptime, t)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account deletion lifecycle */}
      <Card>
        <CardHeader><CardTitle>{t('system.deletion.title', { defaultValue: 'Account deletion lifecycle' })}</CardTitle></CardHeader>
        <CardContent>
          {diagnosticsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                <div key={i} className="flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-input)]">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
          ) : diagnostics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <HealthCard
                label={t('system.deletion.pending', { defaultValue: 'Pending' })}
                value={diagnostics.pendingDeletionCount}
                subtitle={t('system.deletion.pendingSubtitle', { defaultValue: 'in grace window' })}
              />
              <HealthCard
                label={t('system.deletion.expired', { defaultValue: 'Expired' })}
                value={diagnostics.expiredPendingCount}
                subtitle={t('system.deletion.expiredSubtitle', { defaultValue: 'awaiting cleanup' })}
                tone={diagnostics.expiredPendingCount > 0 ? 'warning' : 'default'}
              />
              <HealthCard
                label={t('system.deletion.orphans', { defaultValue: 'Orphan callbacks' })}
                value={diagnostics.subscriptionOrphanCount30d}
                subtitle={t('system.deletion.orphansSubtitle', { defaultValue: 'last 30 days' })}
              />
            </div>
          ) : (
            <p className="text-[14px] text-[var(--text-tertiary)] py-2">{t('system.deletion.loadFailed', { defaultValue: 'Failed to load diagnostics.' })}</p>
          )}
        </CardContent>
      </Card>

      {/* Maintenance */}
      <Card>
        <CardHeader><CardTitle>{t('system.maintenance.title', { defaultValue: 'Maintenance Mode' })}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="row-spread">
              <div>
                <span className="text-[14px] text-[var(--text-secondary)]">{t('system.maintenance.label', { defaultValue: 'Maintenance mode' })}</span>
                {maintenance?.enabled && (
                  <p className="text-[12px] text-[var(--color-warning)]">{t('system.maintenance.active', { defaultValue: 'Currently active' })}</p>
                )}
              </div>
              <Switch
                checked={maintenance?.enabled ?? false}
                onCheckedChange={handleToggleMaintenance}
              />
            </div>
            <FormField label={t('system.maintenance.messageLabel', { defaultValue: 'Message (shown to users)' })} htmlFor="maint-msg">
              <Input
                id="maint-msg"
                value={maintenanceMsg}
                onChange={(e) => setMaintenanceMsg(e.target.value)}
                placeholder={t('system.maintenance.messagePlaceholder', { defaultValue: 'We are performing scheduled maintenance...' })}
                className="text-[14px]"
              />
            </FormField>
            {maintenanceMsg !== (maintenance?.message || '') && (
              <Button size="sm" className="self-start" onClick={() => handleToggleMaintenance(maintenance?.enabled ?? false)}>
                {t('system.maintenance.updateMessage', { defaultValue: 'Update Message' })}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Announcements */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('system.announcements.title', { defaultValue: 'Announcements' })}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setNewBannerOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('system.announcements.new', { defaultValue: 'New' })}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {announcementsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <p className="text-[14px] text-[var(--text-tertiary)] py-2">{t('system.announcements.empty', { defaultValue: 'No active announcements.' })}</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
              {announcements.map((a) => (
                <div key={a.id} className="row-spread py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={a.type === 'critical' ? 'destructive' : a.type === 'warning' ? 'outline' : 'secondary'} className="text-[11px] shrink-0">
                      {announcementTypeLabels[a.type] ?? a.type}
                    </Badge>
                    <span className="text-[14px] text-[var(--text-primary)] truncate">{a.text}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDeleteBanner(a.id)}
                    aria-label={t('system.announcements.deleteAria', { defaultValue: 'Delete announcement' })}
                    className="text-[var(--destructive)] hover:text-[var(--destructive)] shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create announcement dialog */}
      <Dialog open={newBannerOpen} onOpenChange={(open) => !open && setNewBannerOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('system.announcements.dialog.title', { defaultValue: 'New Announcement' })}</DialogTitle>
            <DialogDescription>{t('system.announcements.dialog.description', { defaultValue: 'Create a banner announcement visible to all users.' })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label={t('system.announcements.dialog.typeLabel', { defaultValue: 'Type' })} htmlFor="banner-type">
              <OptionGroup
                options={[
                  { key: 'info' as const, label: announcementTypeLabels.info },
                  { key: 'warning' as const, label: announcementTypeLabels.warning },
                  { key: 'critical' as const, label: announcementTypeLabels.critical },
                ]}
                value={bannerForm.type}
                onChange={(type) => setBannerForm(f => ({ ...f, type }))}
                size="sm"
              />
            </FormField>
            <FormField label={t('system.announcements.dialog.messageLabel', { defaultValue: 'Message' })} htmlFor="banner-text">
              <Textarea
                id="banner-text"
                value={bannerForm.text}
                onChange={(e) => setBannerForm(f => ({ ...f, text: e.target.value }))}
                placeholder={t('system.announcements.dialog.messagePlaceholder', { defaultValue: 'Announcement text...' })}
                rows={3}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewBannerOpen(false)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button onClick={handleCreateBanner} disabled={!bannerForm.text.trim() || bannerSaving}>
              {bannerSaving
                ? t('system.announcements.dialog.creating', { defaultValue: 'Creating...' })
                : t('system.announcements.dialog.create', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Audit Log Tab ───────────────────────────────────────────────────

function AuditLogTab() {
  const { t } = useTranslation('admin');
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const { entries, count, isLoading } = useAuditLog(page, { action: actionFilter || undefined });
  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchInput
          placeholder={t('system.audit.filterPlaceholder', { defaultValue: 'Filter by action...' })}
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          onClear={actionFilter ? () => { setActionFilter(''); setPage(1); } : undefined}
          className="flex-1"
        />
      </div>

      {isLoading ? (
        <Table>
          <TableHeader>
            <div className="w-28"><Skeleton className="h-3 w-10" /></div>
            <div className="w-24"><Skeleton className="h-3 w-10" /></div>
            <div className="w-28"><Skeleton className="h-3 w-12" /></div>
            <div className="flex-1"><Skeleton className="h-3 w-10" /></div>
            <div className="hidden lg:block flex-1"><Skeleton className="h-3 w-12" /></div>
          </TableHeader>
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
              <div className="w-28"><Skeleton className="h-4 w-20" /></div>
              <div className="w-24"><Skeleton className="h-4 w-16" /></div>
              <div className="w-28"><Skeleton className="h-4 w-20" /></div>
              <div className="flex-1"><Skeleton className="h-4 w-24" /></div>
              <div className="hidden lg:block flex-1"><Skeleton className="h-4 w-16" /></div>
            </div>
          ))}
        </Table>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('system.audit.empty', { defaultValue: 'No audit entries found' })}
          subtitle={actionFilter ? t('system.audit.tryDifferentFilter', { defaultValue: 'Try a different filter' }) : undefined}
          variant="search"
        />
      ) : (
        <Table>
          <TableHeader>
            <div className="w-28">
              <span className="ui-col-header">{t('system.audit.time', { defaultValue: 'Time' })}</span>
            </div>
            <div className="w-24">
              <span className="ui-col-header">{t('system.audit.actor', { defaultValue: 'Actor' })}</span>
            </div>
            <div className="w-28">
              <span className="ui-col-header">{t('system.audit.action', { defaultValue: 'Action' })}</span>
            </div>
            <div className="flex-1">
              <span className="ui-col-header">{t('system.audit.target', { defaultValue: 'Target' })}</span>
            </div>
            <div className="hidden lg:block flex-1">
              <span className="ui-col-header">{t('system.audit.details', { defaultValue: 'Details' })}</span>
            </div>
          </TableHeader>
          {entries.map((entry) => (
            <TableRow key={entry.id} className="cursor-default [@media(hover:hover)]:hover:bg-[var(--bg-hover)]">
              <div className="w-28">
                <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">{relativeTime(entry.createdAt)}</span>
              </div>
              <div className="w-24 truncate">
                <span className="text-[14px] text-[var(--text-secondary)]">{entry.actorName}</span>
              </div>
              <div className="w-28">
                <Badge variant="secondary" className="text-[11px]">{entry.action}</Badge>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[14px] text-[var(--text-primary)] truncate block">
                  {entry.targetName || entry.targetId || '—'}
                </span>
                {entry.targetType && (
                  <span className="text-[12px] text-[var(--text-tertiary)]">{entry.targetType}</span>
                )}
              </div>
              <div className="hidden lg:block flex-1 min-w-0">
                <span className="text-[12px] text-[var(--text-tertiary)] truncate block">
                  {entry.details ? Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}
                </span>
              </div>
            </TableRow>
          ))}
        </Table>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={count}
        pageSize={PAGE_SIZE}
        itemLabel={t('system.audit.paginationLabel', { defaultValue: 'entries' })}
      />
    </>
  );
}

// ── Locations Tab ───────────────────────────────────────────────────

function LocationsTab() {
  const { t, i18n } = useTranslation('admin');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { locations, count, isLoading } = useAdminLocations(search, page);
  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <>
      <div className="flex items-center gap-2">
        <SearchInput
          placeholder={t('system.locations.searchPlaceholder', { defaultValue: 'Search locations...' })}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          onClear={search ? () => { setSearch(''); setPage(1); } : undefined}
          className="flex-1"
        />
        <Badge variant="secondary" className="text-[11px]">{count}</Badge>
      </div>

      {isLoading ? (
        <Table>
          <TableHeader>
            <div className="flex-1"><Skeleton className="h-3 w-12" /></div>
            <div className="w-24"><Skeleton className="h-3 w-10" /></div>
            <div className="hidden sm:block w-16"><Skeleton className="h-3 w-10" /></div>
            <div className="hidden sm:block w-14"><Skeleton className="h-3 w-8" /></div>
            <div className="hidden lg:block w-14"><Skeleton className="h-3 w-10" /></div>
            <div className="hidden sm:block w-24"><Skeleton className="h-3 w-14" /></div>
          </TableHeader>
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex-1 min-w-0"><Skeleton className="h-4 w-28" /></div>
              <div className="w-24"><Skeleton className="h-4 w-16" /></div>
              <div className="hidden sm:block w-16"><Skeleton className="h-4 w-8" /></div>
              <div className="hidden sm:block w-14"><Skeleton className="h-4 w-8" /></div>
              <div className="hidden lg:block w-14"><Skeleton className="h-4 w-8" /></div>
              <div className="hidden sm:block w-24"><Skeleton className="h-3 w-16" /></div>
            </div>
          ))}
        </Table>
      ) : locations.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('system.locations.empty', { defaultValue: 'No locations found' })}
          subtitle={search ? t('system.locations.tryDifferentSearch', { defaultValue: 'Try a different search term' }) : undefined}
          variant="search"
        />
      ) : (
        <Table>
          <TableHeader>
            <div className="flex-1">
              <span className="ui-col-header">{t('system.locations.name', { defaultValue: 'Name' })}</span>
            </div>
            <div className="w-24">
              <span className="ui-col-header">{t('system.locations.owner', { defaultValue: 'Owner' })}</span>
            </div>
            <div className="hidden sm:block w-16">
              <span className="ui-col-header">{t('system.locations.members', { defaultValue: 'Members' })}</span>
            </div>
            <div className="hidden sm:block w-14">
              <span className="ui-col-header">{t('system.locations.bins', { defaultValue: 'Bins' })}</span>
            </div>
            <div className="hidden lg:block w-14">
              <span className="ui-col-header">{t('system.locations.areas', { defaultValue: 'Areas' })}</span>
            </div>
            <div className="hidden sm:block w-24">
              <span className="ui-col-header">{t('system.locations.created', { defaultValue: 'Created' })}</span>
            </div>
          </TableHeader>
          {locations.map((loc) => (
            <TableRow key={loc.id} className="cursor-default [@media(hover:hover)]:hover:bg-[var(--bg-hover)]">
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium text-[var(--text-primary)] truncate block">{loc.name}</span>
              </div>
              <div className="w-24 truncate">
                <span className="text-[14px] text-[var(--text-secondary)]">{loc.ownerDisplayName || loc.ownerUsername}</span>
              </div>
              <div className="hidden sm:block w-16 text-[14px] text-[var(--text-secondary)] tabular-nums">{loc.memberCount}</div>
              <div className="hidden sm:block w-14 text-[14px] text-[var(--text-secondary)] tabular-nums">{loc.binCount}</div>
              <div className="hidden lg:block w-14 text-[14px] text-[var(--text-secondary)] tabular-nums">{loc.areaCount}</div>
              <div className="hidden sm:block w-24">
                <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">{new Date(loc.createdAt).toLocaleDateString(i18n.language)}</span>
              </div>
            </TableRow>
          ))}
        </Table>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={count}
        pageSize={PAGE_SIZE}
        itemLabel={t('system.locations.paginationLabel', { defaultValue: 'locations' })}
      />
    </>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export function AdminSystemPage() {
  const { t } = useTranslation('admin');
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect non-admins
  useEffect(() => {
    if (user && !user.isAdmin) navigate('/', { replace: true });
  }, [user, navigate]);

  const [tab, setTab] = useState<Tab>('system');

  // Prevent flash of admin content for non-admins
  if (user && !user.isAdmin) return null;

  return (
    <div className="page-content-wide">
      <PageHeader
        title={t('system.pageTitle', { defaultValue: 'System' })}
        back
        backTo="/admin/users"
        actions={
          <OptionGroup
            options={[
              { key: 'system' as const, label: t('system.tabSystem', { defaultValue: 'System' }), icon: Server },
              { key: 'audit' as const, label: t('system.tabAudit', { defaultValue: 'Audit Log' }), icon: ShieldAlert },
              { key: 'locations' as const, label: t('system.tabLocations', { defaultValue: 'Locations' }), icon: MapPin },
            ]}
            value={tab}
            onChange={setTab}
          />
        }
      />

      {tab === 'system' && <SystemTab />}
      {tab === 'audit' && <AuditLogTab />}
      {tab === 'locations' && <LocationsTab />}
    </div>
  );
}
