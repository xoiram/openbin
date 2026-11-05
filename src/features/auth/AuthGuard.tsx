import { lazy, Suspense } from 'react';
import { matchPath, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isSelfHostedInstance, useAuthStatusConfig } from '@/lib/qrConfig';

// Only anonymous visitors (and logged-in non-members, via BinDetailPage) ever need this, so keep it out of the main bundle.
const PublicBinPage = lazy(() => import('@/features/bins/PublicBinPage').then((m) => ({ default: m.PublicBinPage })));

function FullPageSpinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--bg-base)]">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--bg-active)] border-t-[var(--accent)] animate-spin" />
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { config: authStatus, loaded: statusLoaded } = useAuthStatusConfig();
  const location = useLocation();

  if (loading || !statusLoaded) {
    return <FullPageSpinner />;
  }

  if (!user) {
    // A scanned QR code points at /bin/:id. Let anonymous visitors try the public read-only view first; it
    // sends them on to /login itself when the box isn't public (docs/public-qr-access.md).
    const binMatch = matchPath('/bin/:id', location.pathname);
    if (binMatch?.params.id) {
      return (
        <Suspense fallback={<FullPageSpinner />}>
          <PublicBinPage binId={binMatch.params.id} />
        </Suspense>
      );
    }
    return <Navigate to="/login" replace />;
  }

  // Cloud-only: redirect users with stale or missing consent to the
  // completion interstitial (covers OAuth signups, re-acceptance, and any
  // unconsented edge cases). Skip the redirect if we're already on it.
  const consentStale =
    !isSelfHostedInstance() &&
    authStatus.tosVersion !== null &&
    (user.currentTosVersion !== authStatus.tosVersion ||
      user.currentPrivacyVersion !== authStatus.privacyVersion);

  if (consentStale && location.pathname !== '/auth/complete-signup') {
    return <Navigate to="/auth/complete-signup" replace />;
  }

  return <>{children}</>;
}
