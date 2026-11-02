import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicBinView } from './PublicBinView';
import { usePublicBin } from './usePublicBin';

/**
 * Shown inside the app shell when a logged-in user opens a box they can't access (say, a household member
 * with their own account who scanned a label). If the box's location allows public QR access they get the
 * read-only view; otherwise `notFound` (the usual "not found" state) is rendered.
 */
export function PublicBinFallback({ binId, notFound }: { binId: string | undefined; notFound: React.ReactNode }) {
  const { t } = useTranslation('bins');
  const state = usePublicBin(binId);

  if (state.status === 'loading') {
    return (
      <div className="page-content max-w-2xl" role="status" aria-busy="true">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  if (state.status !== 'ready') return <>{notFound}</>;

  return (
    <div className="page-content max-w-2xl space-y-4">
      <p className="text-xs text-[var(--text-tertiary)]">
        {t('publicPage.readOnlyNotice', { defaultValue: "You're viewing a read-only copy. You don't have access to edit this." })}
      </p>
      <PublicBinView bin={state.bin} />
    </div>
  );
}
