import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { resolveIcon } from '@/lib/iconMap';
import { useTerminology } from '@/lib/terminology';
import { cn, focusRing, sectionHeader } from '@/lib/utils';
import type { Bin } from '@/types';
import { useBinList } from './useBins';

interface ChildBinsSectionProps {
  bin: Pick<Bin, 'id' | 'parent_bin_id' | 'child_count'>;
  canEdit: boolean;
  onAddInside: () => void;
}

/**
 * "Inside this box": the boxes nested in a top-level box, with an add button. A child box never
 * shows it (boxes nest one level only). Writers also see it as an empty state when there are none.
 */
export function ChildBinsSection({ bin, canEdit, onAddInside }: ChildBinsSectionProps) {
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const hasChildren = (bin.child_count ?? 0) > 0;
  const hidden = !!bin.parent_bin_id || (!hasChildren && !canEdit);
  const { bins } = useBinList(undefined, 'name', undefined, hidden || !hasChildren);

  if (hidden) return null;
  const children = bins.filter((b) => b.parent_bin_id === bin.id);

  return (
    <section className="mb-5" aria-labelledby={`child-bins-${bin.id}`} data-testid="child-bins-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={`child-bins-${bin.id}`} className={cn(sectionHeader, 'm-0')}>
          {t('nesting.insideThis', { defaultValue: 'Inside this {{bin}}', bin: term.bin })}
        </h2>
        {canEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={onAddInside}>
            <Plus className="h-4 w-4" />
            {t('nesting.addInside', { defaultValue: 'Add {{bin}} inside', bin: term.bin })}
          </Button>
        )}
      </div>
      {children.length === 0 ? (
        <p className="text-[14px] text-[var(--text-tertiary)]">
          {t('nesting.noneInside', { defaultValue: 'No {{bins}} inside yet.', bins: term.bins })}
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {children.map((child) => {
            const Icon = resolveIcon(child.icon);
            return (
              <li key={child.id}>
                <Link
                  to={`/bin/${child.id}`}
                  className={cn(
                    'flex min-h-11 items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 transition-colors hover:bg-[var(--bg-hover)]',
                    focusRing,
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--text-primary)]">{child.name}</span>
                  <span className="shrink-0 text-[12px] text-[var(--text-tertiary)]">
                    {t('common:itemCount', { count: child.items.length, defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items' })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
