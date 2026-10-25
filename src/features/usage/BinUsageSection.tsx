import { useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useUserPreferences } from '@/lib/userPreferences';
import { flatCard } from '@/lib/utils';
import { GranularitySegmented } from './GranularitySegmented';
import { InlineRetryError, UsageHeatmap, UsageHeatmapSkeleton } from './UsageHeatmap';
import { availableYears, yearOf } from './usageBuckets';
import { useBinUsage } from './useBinUsage';
import { YearChipPager } from './YearChipPager';

function formatRelativeFromNow(iso: string, fmt: Intl.RelativeTimeFormat): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const days = Math.round((then - Date.now()) / 86_400_000);
  if (Math.abs(days) < 1) return fmt.format(0, 'day');
  if (Math.abs(days) < 30) return fmt.format(days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return fmt.format(months, 'month');
  return fmt.format(Math.round(months / 12), 'year');
}

/** Server sorts DESC but don't trust it — malformed rows at the head would mask a valid latest date. */
function findLastValidDate(entries: Array<{ date: string }>): string | null {
  let latest: string | null = null;
  for (const e of entries) {
    if (!Number.isFinite(yearOf(e.date))) continue;
    if (latest === null || e.date > latest) latest = e.date;
  }
  return latest;
}

interface BinUsageSectionProps {
  binId: string;
}

export function BinUsageSection({ binId }: BinUsageSectionProps) {
  const { t, i18n } = useTranslation('usage');
  const relativeFmt = useMemo(() => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }), [i18n.language]);
  const formatLastUse = useCallback((iso: string) => formatRelativeFromNow(iso, relativeFmt), [relativeFmt]);
  const { usage, isLoading, error, refresh } = useBinUsage(binId);
  const { preferences } = useUserPreferences();
  const years = useMemo(() => availableYears(usage), [usage]);
  const [year, setYear] = useState<number | null>(null);

  const selectedYear =
    year !== null && years.includes(year) ? year : (years[0] ?? new Date().getUTCFullYear());

  const lastUse = useMemo(() => findLastValidDate(usage), [usage]);
  const activeInYear = useMemo(() => {
    let count = 0;
    for (const d of usage) if (yearOf(d.date) === selectedYear) count++;
    return count;
  }, [usage, selectedYear]);

  if (isLoading) {
    return (
      <div className={`${flatCard} p-4`}>
        <UsageHeatmapSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <InlineRetryError
        title={t('loadFailed', { defaultValue: "Couldn't load usage data" })}
        detail={error}
        onRetry={refresh}
        className="py-1"
      />
    );
  }

  if (usage.length === 0) {
    return (
      <p className="text-[12px] text-[var(--text-tertiary)] leading-relaxed py-1">
        <Trans
          t={t}
          i18nKey="empty"
          defaults="No activity yet. Choose which actions count in <link>preferences</link>."
          components={{ link: <Link to="/settings/preferences" className="underline text-[var(--accent)]" /> }}
        />
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[var(--text-secondary)] tabular-nums">
        {lastUse
          ? t('summaryWithLastUse', {
              count: activeInYear,
              year: selectedYear,
              lastUse: formatLastUse(lastUse),
              defaultValue_one: '{{count}} active day in {{year}} · last used {{lastUse}}',
              defaultValue_other: '{{count}} active days in {{year}} · last used {{lastUse}}',
            })
          : t('summary', {
              count: activeInYear,
              year: selectedYear,
              defaultValue_one: '{{count}} active day in {{year}}',
              defaultValue_other: '{{count}} active days in {{year}}',
            })}
      </p>
      <div className={`${flatCard} p-4 flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <GranularitySegmented />
          <YearChipPager years={years} selected={selectedYear} onSelect={setYear} />
        </div>
        <UsageHeatmap
          data={usage}
          year={selectedYear}
          granularity={preferences.usage_granularity}
        />
      </div>
    </div>
  );
}
