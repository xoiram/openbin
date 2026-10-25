import { AlertTriangle, Clock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crossfade } from '@/components/ui/crossfade';
import { EmptyState } from '@/components/ui/empty-state';
import { ActivityTableSkeleton } from '@/features/activity/ActivityTableSkeleton';
import { ActivityTableView } from '@/features/activity/ActivityTableView';
import { useTerminology } from '@/lib/terminology';
import { sectionHeader, sectionHeaderRow } from '@/lib/utils';
import { useBinActivity } from './useBinActivity';

const PREVIEW_COUNT = 5;
const EXPANDED_PAGE_SIZE = 20;

interface BinDetailActivitySectionProps {
  binId: string;
}

export function BinDetailActivitySection({ binId }: BinDetailActivitySectionProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const [expanded, setExpanded] = useState(false);
  const { entries, isLoading, isLoadingMore, hasMore, error, loadMore } = useBinActivity(
    binId,
    expanded ? EXPANDED_PAGE_SIZE : PREVIEW_COUNT,
  );

  const visibleEntries = expanded ? entries : entries.slice(0, PREVIEW_COUNT);
  const hasHiddenEntries = entries.length > PREVIEW_COUNT || hasMore;
  const showToggle = hasHiddenEntries && !isLoading && !error;

  return (
    <section>
      <header className={sectionHeaderRow}>
        <h3 className={sectionHeader}>{t('activity.title', { defaultValue: 'Activity' })}</h3>
      </header>

      <Crossfade
        isLoading={isLoading && entries.length === 0}
        skeleton={<ActivityTableSkeleton count={PREVIEW_COUNT} />}
      >
        {error ? (
          <EmptyState
            icon={AlertTriangle}
            title={t('activity.loadFailed', { defaultValue: 'Failed to load activity' })}
            subtitle={error}
            compact
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={t('activity.emptyTitle', { defaultValue: 'No activity yet' })}
            subtitle={t('activity.emptySubtitle', { defaultValue: 'Changes to this {{bin}} will appear here', bin: term.bin })}
            compact
          />
        ) : (
          <ActivityTableView
            entries={visibleEntries}
            hasMore={expanded && hasMore}
            isLoadingMore={isLoadingMore}
            loadMore={loadMore}
            currentEntityId={binId}
          />
        )}
      </Crossfade>

      {showToggle && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="text-[13px] text-[var(--accent)] underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none rounded-sm"
          >
            {expanded ? t('activity.showLess', { defaultValue: 'Show less' }) : t('activity.showAll', { defaultValue: 'Show all events' })}
          </button>
        </div>
      )}
    </section>
  );
}
