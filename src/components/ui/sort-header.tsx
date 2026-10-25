import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

interface SortHeaderProps<C extends string> {
  label: string;
  column: C;
  currentColumn: C;
  currentDirection: SortDirection;
  onSort: (column: C, direction: SortDirection) => void;
  defaultDirection?: SortDirection;
  className?: string;
}

export function SortHeader<C extends string>({
  label,
  column,
  currentColumn,
  currentDirection,
  onSort,
  defaultDirection = 'asc',
  className,
}: SortHeaderProps<C>) {
  const { t } = useTranslation('common');
  const active = currentColumn === column;
  const Chevron = active && currentDirection === 'desc' ? ChevronDown : ChevronUp;

  function handleClick() {
    if (active) {
      onSort(column, currentDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(column, defaultDirection);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        !active
          ? t('sortHeader.sortBy', { defaultValue: 'Sort by {{label}}', label })
          : currentDirection === 'asc'
            ? t('sortHeader.sortedAscending', { defaultValue: '{{label}}, sorted ascending', label })
            : t('sortHeader.sortedDescending', { defaultValue: '{{label}}, sorted descending', label })
      }
      className={cn(
        'ui-col-header flex items-center gap-0.5 transition-colors min-h-[44px] -my-2',
        active ? 'text-[var(--text-primary)]' : 'hover:text-[var(--text-secondary)]',
        className,
      )}
    >
      {label}
      {active && <Chevron className="h-3 w-3" />}
    </button>
  );
}
