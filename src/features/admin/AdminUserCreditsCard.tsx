import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { AdminUserOverrides } from './useAdminUserOverrides';

interface AdminUserCreditsCardProps {
  overrides: AdminUserOverrides;
}

export function AdminUserCreditsCard({ overrides }: AdminUserCreditsCardProps) {
  const { t } = useTranslation('admin');
  return (
    <Card>
      <CardHeader><CardTitle>{t('detail.credits.title', { defaultValue: 'AI Credits' })}</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
          <div className="row-spread py-3 first:pt-0">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.credits.grantCredits', { defaultValue: 'Grant credits' })}</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={10000}
                placeholder={t('detail.credits.amountPlaceholder', { defaultValue: 'Amount' })}
                value={overrides.grantAmount}
                onChange={(e) => overrides.setGrantAmount(e.target.value)}
                className="w-24 h-8 text-[14px]"
              />
              <Button size="sm" onClick={overrides.handleGrantCredits} disabled={!overrides.grantAmount}>{t('detail.credits.grant', { defaultValue: 'Grant' })}</Button>
            </div>
          </div>
          <div className="row-spread py-3 last:pb-0">
            <span className="text-[14px] text-[var(--text-secondary)]">{t('detail.credits.resetToZero', { defaultValue: 'Reset credits to 0' })}</span>
            <Button variant="outline" size="sm" onClick={overrides.handleResetCredits}>{t('detail.credits.reset', { defaultValue: 'Reset' })}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
