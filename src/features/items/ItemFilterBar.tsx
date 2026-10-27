import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, type SelectOption } from '@/components/ui/select';
import { buildAreaTree, flattenAreaTree, useAreaList } from '@/features/areas/useAreas';
import { useAuth } from '@/lib/auth';
import { useTerminology } from '@/lib/terminology';
import { cn } from '@/lib/utils';
import type { ItemFilters } from './useItems';

const ALL = '__all__';
const UNASSIGNED = '__unassigned__';

interface ItemFilterBarProps {
  filters: ItemFilters;
  hasFilters: boolean;
  onAreaChange: (areaId: string | null) => void;
  onUnassignedChange: (on: boolean) => void;
  onLooseChange: (on: boolean) => void;
  onClear: () => void;
}

/** Area / Unassigned / "Not in a box" filters for the Items page. The selected state shows what is active. */
export function ItemFilterBar({ filters, hasFilters, onAreaChange, onUnassignedChange, onLooseChange, onClear }: ItemFilterBarProps) {
  const { t } = useTranslation('items');
  const term = useTerminology();
  const { activeLocationId } = useAuth();
  const { areas } = useAreaList(activeLocationId);
  const flat = useMemo(() => flattenAreaTree(buildAreaTree(areas)), [areas]);

  const options: SelectOption<string>[] = [
    { value: ALL, label: t('looseItems.filters.allAreas', { defaultValue: 'All {{areas}}', areas: term.areas }) },
    { value: UNASSIGNED, label: t('looseItems.filters.unassigned', { defaultValue: 'Unassigned' }) },
    ...flat.map((a) => ({ value: a.id, label: `${' '.repeat(a.depth)}${a.name}` })),
  ];
  const value = filters.unassigned ? UNASSIGNED : (filters.areaId ?? ALL);
  // An area id from a stale link isn't in the list; show it as "All" rather than an empty trigger.
  const shown = options.some((o) => o.value === value) ? value : ALL;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[160px]">
        <Select<string>
          size="sm"
          value={shown}
          options={options}
          ariaLabel={t('looseItems.filters.areaLabel', { defaultValue: 'Filter by {{area}}', area: term.area })}
          className={cn('w-full', (filters.areaId || filters.unassigned) && 'border-[var(--accent)]')}
          onChange={(v) => {
            if (v === ALL) onAreaChange(null);
            else if (v === UNASSIGNED) onUnassignedChange(true);
            else onAreaChange(v);
          }}
        />
      </div>
      <button
        type="button"
        aria-pressed={Boolean(filters.loose)}
        onClick={() => onLooseChange(!filters.loose)}
        className={cn(
          'rounded-full border px-3 py-1.5 text-[var(--text-sm)] transition-colors',
          filters.loose
            ? 'border-[var(--accent)] bg-[var(--bg-active)] text-[var(--text-primary)]'
            : 'border-[var(--border-flat)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
        )}
      >
        {t('looseItems.filters.notInBin', { defaultValue: 'Not in a {{bin}}', bin: term.bin })}
      </button>
      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-[var(--text-sm)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          {t('looseItems.filters.clear', { defaultValue: 'Clear filters' })}
        </button>
      )}
    </div>
  );
}
