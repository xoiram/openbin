import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRelativeTime } from '@/features/activity/useRelativeTime';

import { LimitStatItem, StatItem } from './AdminUserStatItems';
import type { AdminUserDetail } from './useAdminUsers';

interface AdminUserStatsCardProps {
  detail: AdminUserDetail;
}

export function AdminUserStatsCard({ detail }: AdminUserStatsCardProps) {
  const { t } = useTranslation('admin');
  const relativeTime = useRelativeTime();
  const createdAt = new Date(detail.createdAt);
  const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
  const showLimits =
    detail.stats.binLimit !== null || detail.stats.storageLimit !== null || detail.stats.aiCreditsLimit > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.stats.title', { defaultValue: 'Stats' })}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <StatItem label={t('detail.stats.lastActive', { defaultValue: 'Last Active' })} value={relativeTime(detail.lastActiveAt)} />
          <StatItem label={t('detail.stats.locations', { defaultValue: 'Locations' })} value={detail.stats.locationCount} />
          <StatItem label={t('detail.stats.bins', { defaultValue: 'Bins' })} value={detail.stats.binCount} />
          <StatItem label={t('detail.stats.items', { defaultValue: 'Items' })} value={detail.stats.itemCount} />
          <StatItem label={t('detail.stats.photos', { defaultValue: 'Photos' })} value={detail.stats.photoCount} />
          <StatItem label={t('detail.stats.storageMb', { defaultValue: 'Storage (MB)' })} value={detail.stats.photoStorageMb} />
          <StatItem label={t('detail.stats.scans30d', { defaultValue: 'Scans (30d)' })} value={detail.stats.scans30d} />
          <StatItem label={t('detail.stats.apiKeys', { defaultValue: 'API Keys' })} value={detail.stats.apiKeyCount} />
          <StatItem label={t('detail.stats.apiRequests7d', { defaultValue: 'API Reqs (7d)' })} value={detail.stats.apiRequests7d} />
          <StatItem label={t('detail.stats.shares', { defaultValue: 'Shares' })} value={detail.stats.shareCount} />
          <StatItem label={t('detail.stats.newBins7d', { defaultValue: 'New Bins (7d)' })} value={detail.stats.binsCreated7d} />
          <StatItem label={t('detail.stats.accountAge', { defaultValue: 'Account Age' })} value={t('detail.stats.accountAgeDays', { defaultValue: '{{days}}d', days: accountAgeDays })} />
        </div>

        {showLimits && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
            <LimitStatItem label={t('detail.stats.binUsage', { defaultValue: 'Bin Usage' })} used={detail.stats.binCount} limit={detail.stats.binLimit} />
            <LimitStatItem label={t('detail.stats.storageUsage', { defaultValue: 'Storage Usage' })} used={detail.stats.photoStorageMb} limit={detail.stats.storageLimit} unit={t('detail.stats.mbUnit', { defaultValue: 'MB' })} />
            {detail.stats.aiCreditsLimit > 0 && (
              <LimitStatItem label={t('detail.stats.aiCredits', { defaultValue: 'AI Credits' })} used={detail.stats.aiCreditsUsed} limit={detail.stats.aiCreditsLimit} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
