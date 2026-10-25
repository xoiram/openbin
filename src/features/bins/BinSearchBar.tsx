import { SlidersHorizontal } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DismissibleBadge } from '@/components/ui/dismissible-badge';
import { SearchInput } from '@/components/ui/search-input';
import { Tooltip } from '@/components/ui/tooltip';
import type { Terminology } from '@/lib/terminology';
import type { Area } from '@/types';
import type { BinFilters } from './useBins';

interface BinSearchBarProps {
  search: string;
  setSearch: (v: string) => void;
  filters: BinFilters;
  setFilters: (v: BinFilters | ((prev: BinFilters) => BinFilters)) => void;
  clearAll: () => void;
  areas: Area[];
  getTagStyle: (tag: string) => CSSProperties | undefined;
  activeCount: number;
  hasBadges: boolean;
  onOpenFilter: () => void;
  term: Terminology;
}

export function BinSearchBar({
  search,
  setSearch,
  filters,
  setFilters,
  clearAll,
  areas,
  getTagStyle,
  activeCount,
  hasBadges,
  onOpenFilter,
  term,
}: BinSearchBarProps) {
  const { t } = useTranslation('bins');
  const showClear = hasBadges || Boolean(search);
  return (
    <div className="flex items-center gap-2.5">
      <SearchInput
        data-shortcut-search
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('searchBar.placeholder', { defaultValue: 'Search {{bins}}...', bins: term.bins })}
        aria-label={t('searchBar.ariaLabel', { defaultValue: 'Search {{bins}}', bins: term.bins })}
        containerClassName="flex-1"
        onClear={showClear ? clearAll : undefined}
        clearLabel={hasBadges ? t('searchBar.clearSearchAndFilters', { defaultValue: 'Clear search and filters' }) : t('searchBar.clearSearch', { defaultValue: 'Clear search' })}
      >
        {hasBadges && (
          <div className="row-tight overflow-x-auto scrollbar-hide min-w-0 shrink">
            {filters.tags.map((tag) => (
              <DismissibleBadge
                key={`tag-${tag}`}
                onDismiss={() => setFilters({ ...filters, tags: filters.tags.filter((t2) => t2 !== tag) })}
                ariaLabel={t('searchBar.removeTagFilter', { defaultValue: 'Remove tag filter {{tag}}', tag })}
                style={getTagStyle(tag)}
              >
                {tag}
              </DismissibleBadge>
            ))}
            {filters.tags.length >= 2 && (
              <Badge variant="outline" className="py-0.5 shrink-0 text-[11px] text-[var(--text-tertiary)]">
                {filters.tagMode === 'all' ? t('searchBar.allTags', { defaultValue: 'All tags' }) : t('searchBar.anyTag', { defaultValue: 'Any tag' })}
              </Badge>
            )}
            {filters.areas.map((areaKey) => {
              const areaName = areaKey === '__unassigned__' ? t('filters.unassigned', { defaultValue: 'Unassigned' }) : areas.find((a) => a.id === areaKey)?.name ?? areaKey;
              return (
                <DismissibleBadge
                  key={`area-${areaKey}`}
                  onDismiss={() => setFilters({ ...filters, areas: filters.areas.filter((a) => a !== areaKey) })}
                  ariaLabel={t('searchBar.removeAreaFilter', { defaultValue: 'Remove {{areaTerm}} filter {{area}}', areaTerm: term.area, area: areaName })}
                >
                  {areaName}
                </DismissibleBadge>
              );
            })}
            {filters.hasItems && (
              <DismissibleBadge onDismiss={() => setFilters({ ...filters, hasItems: false })} ariaLabel={t('searchBar.removeHasItemsFilter', { defaultValue: 'Remove has items filter' })}>
                {t('filters.hasItems', { defaultValue: 'Has items' })}
              </DismissibleBadge>
            )}
            {filters.hasNotes && (
              <DismissibleBadge onDismiss={() => setFilters({ ...filters, hasNotes: false })} ariaLabel={t('searchBar.removeHasNotesFilter', { defaultValue: 'Remove has notes filter' })}>
                {t('filters.hasNotes', { defaultValue: 'Has notes' })}
              </DismissibleBadge>
            )}
            {filters.needsOrganizing && (
              <DismissibleBadge onDismiss={() => setFilters({ ...filters, needsOrganizing: false })} ariaLabel={t('searchBar.removeNeedsOrganizingFilter', { defaultValue: 'Remove needs organizing filter' })}>
                {t('filters.needsOrganizing', { defaultValue: 'Needs organizing' })}
              </DismissibleBadge>
            )}
          </div>
        )}
      </SearchInput>
      <Tooltip content={t('searchBar.filter', { defaultValue: 'Filter' })} side="bottom">
        <Button
          variant="secondary"
          size="icon"
          onClick={onOpenFilter}
          className="shrink-0 relative rounded-[var(--radius-sm)]"
          aria-label={t('searchBar.filterBins', { defaultValue: 'Filter {{bins}}', bins: term.bins })}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-[var(--accent)] text-[10px] font-bold text-white flex items-center justify-center px-1">
              {activeCount}
            </span>
          )}
        </Button>
      </Tooltip>
    </div>
  );
}
