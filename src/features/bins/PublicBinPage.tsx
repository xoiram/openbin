import { Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { BrandIcon } from '@/components/BrandIcon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicBinView } from './PublicBinView';
import { usePublicBin } from './usePublicBin';

/**
 * Standalone page for anonymous visitors who scan a box's QR code (docs/public-qr-access.md).
 * Rendered by AuthGuard in place of the login redirect for `/bin/:id`, so it has no app providers.
 * When the box isn't publicly viewable the visitor is sent to the login page, as before the feature existed,
 * and returns to the box afterwards.
 */
export function PublicBinPage({ binId }: { binId: string }) {
  const { t } = useTranslation('bins');
  const state = usePublicBin(binId);
  const loginHref = `/login?next=${encodeURIComponent(`/bin/${binId}`)}`;

  if (state.status === 'unavailable') return <Navigate to={loginHref} replace />;

  if (state.status === 'loading') {
    return (
      <div className="min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)]">
        <div className="mx-auto max-w-2xl px-4 py-12" role="status" aria-busy="true">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center space-y-3 px-4">
          <Unlink className="h-10 w-10 text-[var(--text-tertiary)] mx-auto" />
          <p className="text-lg font-semibold">{t('publicPage.errorTitle', { defaultValue: "Couldn't load this page" })}</p>
          <p className="text-sm text-[var(--text-tertiary)]">{t('publicPage.errorMessage', { defaultValue: 'Check your connection and try again.' })}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('publicPage.retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <PublicBinView bin={state.bin} />
        <div className="pt-4 flex flex-col items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Link to={loginHref} className="text-sm font-medium text-[var(--accent)] hover:underline">
            {t('publicPage.loginToEdit', { defaultValue: 'Log in to edit' })}
          </Link>
          <span className="flex items-center gap-1.5">
            <BrandIcon className="h-3.5 w-3.5" />
            {t('sharedPage.poweredBy', { defaultValue: 'Powered by OpenBin' })}
          </span>
        </div>
      </div>
    </div>
  );
}
