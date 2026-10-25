import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeleton-list';
import { useToast } from '@/components/ui/toast';
import { useLocationList } from '@/features/locations/useLocations';
import { SettingsPageHeader } from '@/features/settings/SettingsPageHeader';
import { useAuth } from '@/lib/auth';
import { useTerminology } from '@/lib/terminology';
import { usePermissions } from '@/lib/usePermissions';
import { relativeTime } from '@/lib/utils';
import type { Bin } from '@/types';
import { notifyBinsChanged, permanentDeleteBin, restoreBinFromTrash, useTrashBins } from './useBins';

export function TrashPage() {
  const navigate = useNavigate();
  const { bins, isLoading } = useTrashBins();
  const { showToast } = useToast();
  const { activeLocationId } = useAuth();
  const { isAdmin, isLoading: permissionsLoading } = usePermissions();
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const { locations } = useLocationList();
  const [confirmDelete, setConfirmDelete] = useState<Bin | null>(null);
  const activeLoc = locations.find((l) => l.id === activeLocationId);
  const retentionDays = (activeLoc as { trash_retention_days?: number } | undefined)?.trash_retention_days ?? 30;

  useEffect(() => {
    if (!permissionsLoading && !isAdmin) {
      navigate('/', { replace: true });
    }
  }, [permissionsLoading, isAdmin, navigate]);

  if (permissionsLoading || !isAdmin) {
    return null;
  }

  async function handleRestore(bin: Bin) {
    try {
      await restoreBinFromTrash(bin.id);
      showToast({ message: t('trash.restored', { defaultValue: '"{{name}}" restored', name: bin.name }), variant: 'success' });
    } catch {
      showToast({ message: t('trash.restoreFailed', { defaultValue: 'Failed to restore {{bin}}', bin: term.bin }), variant: 'error' });
    }
  }

  async function handlePermanentDelete() {
    if (!confirmDelete) return;
    try {
      await permanentDeleteBin(confirmDelete.id);
      notifyBinsChanged();
      showToast({
        message: t('trash.permanentlyDeleted', { defaultValue: '"{{name}}" permanently deleted', name: confirmDelete.name }),
        variant: 'success',
      });
    } catch {
      showToast({ message: t('trash.deleteFailed', { defaultValue: 'Failed to delete {{bin}}', bin: term.bin }), variant: 'error' });
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <SettingsPageHeader
        title={t('trash.title', { defaultValue: 'Trash' })}
        description={t('trash.description', {
          count: retentionDays,
          defaultValue_one: 'Deleted {{bins}} are kept for {{count}} day before being permanently removed.',
          defaultValue_other: 'Deleted {{bins}} are kept for {{count}} days before being permanently removed.',
          bins: term.bins,
        })}
      />

      {isLoading ? (
        <SkeletonList count={3} className="flex flex-col gap-3">
          {() => (
            <Card>
              <CardContent className="py-3 px-4">
                <div className="row-spread gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3.5 w-1/3" />
                  </div>
                  <div className="row-tight shrink-0">
                    <Skeleton className="h-8 w-20 rounded-[var(--radius-full)]" />
                    <Skeleton className="h-8 w-8 rounded-[var(--radius-full)]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </SkeletonList>
      ) : bins.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title={t('trash.emptyTitle', { defaultValue: 'Trash is empty' })}
          subtitle={t('trash.emptySubtitle', { defaultValue: 'Deleted {{bins}} will appear here', bins: term.bins })}
          variant="positive"
        />
      ) : (
        <div className="space-y-3">
          {bins.map((bin) => (
            <Card key={bin.id}>
              <CardContent className="py-3 px-4">
                <div className="row-spread gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
                      {bin.name}
                    </p>
                    <p className="text-[12px] text-[var(--text-tertiary)]">
                      {[
                        t('trash.deletedAgo', { defaultValue: 'Deleted {{time}}', time: relativeTime(bin.deleted_at ?? bin.updated_at) }),
                        bin.area_name || null,
                        Array.isArray(bin.items) && bin.items.length > 0
                          ? t('common:itemCount', {
                              count: bin.items.length,
                              defaultValue_one: '{{count}} item',
                              defaultValue_other: '{{count}} items',
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="row-tight shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(bin)}
                        className="h-8 px-2.5 text-[var(--accent)]"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        {t('trash.restore', { defaultValue: 'Restore' })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(bin)}
                        className="h-8 px-2.5 text-[var(--destructive)]"
                        aria-label={t('trash.deleteForeverAria', { defaultValue: 'Permanently delete {{name}}', name: bin.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirm permanent delete */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trash.confirmTitle', { defaultValue: 'Permanently Delete' })}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-[var(--radius-xl)] bg-[var(--destructive-soft)] flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-[var(--destructive)]" />
            </div>
            <div>
              <p className="text-[15px] text-[var(--text-primary)]">
                <Trans
                  t={t}
                  i18nKey="trash.confirmMessage"
                  defaults='Are you sure you want to permanently delete <strong>"{{name}}"</strong>?'
                  values={{ name: confirmDelete?.name ?? '' }}
                  components={{ strong: <strong /> }}
                />
              </p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
                {t('trash.confirmWarning', { defaultValue: 'This action cannot be undone. All photos will also be deleted.' })}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant="destructive"
              onClick={handlePermanentDelete}
              >
              {t('trash.deleteForever', { defaultValue: 'Delete Forever' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
