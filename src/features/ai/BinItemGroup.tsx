import { CheckSquare, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, flatCard, plural } from '@/lib/utils';
import { BinDisclosurePill } from './BinDisclosurePill';
import { BinGroupHeader } from './BinGroupHeader';
import { ItemRow } from './ItemRow';
import { getMatchDisplay } from './matchDisplay';
import type { QueryMatch } from './useInventoryQuery';
import type { useItemQuerySelection } from './useItemQuerySelection';

type SelectionApi = ReturnType<typeof useItemQuerySelection>;

interface BinItemGroupProps {
  match: QueryMatch;
  canWrite: boolean;
  selection?: SelectionApi;
  /** Items hidden by external actions (e.g. bulk remove). */
  removedItemIds?: Set<string>;
  onBinClick: (binId: string, isTrashed?: boolean) => void;
}

export function BinItemGroup({
  match,
  canWrite,
  selection,
  removedItemIds,
  onBinClick,
}: BinItemGroupProps) {
  const { t } = useTranslation('ai');
  const display = getMatchDisplay(match, t);
  const isExpandable = display.mode === 'inline-disclosure';
  const [expanded, setExpanded] = useState(display.defaultExpanded);
  const itemsId = `items-${match.bin_id}`;
  const hiddenCount = Math.max(0, match.total_item_count - match.items.length);

  const trailing =
    display.mode === 'nav-disclosure' ? (
      <BinDisclosurePill mode="nav" countLabel={display.countLabel} />
    ) : isExpandable ? (
      <BinDisclosurePill
        mode="expand"
        countLabel={display.countLabel}
        expanded={expanded}
        controlsId={itemsId}
        binName={match.name}
        onToggle={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
      />
    ) : undefined;

  return (
    <div className={cn(flatCard, 'overflow-hidden rounded-[var(--radius-sm)]')}>
      <BinGroupHeader
        name={match.name}
        areaName={match.area_name}
        icon={match.icon}
        color={match.color}
        isTrashed={!!match.is_trashed}
        onOpen={() => onBinClick(match.bin_id, match.is_trashed)}
        trailing={trailing}
        interactive={isExpandable}
      />

      {isExpandable && (
        <section
          id={itemsId}
          aria-label={t('itemQuery.itemsInBin', { defaultValue: 'Items in {{bin}}', bin: match.name })}
          aria-hidden={!expanded}
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          {/* @ts-expect-error -- inert is valid HTML but not typed in React 18 */}
          <div className="min-h-0 overflow-hidden" inert={!expanded ? true : undefined}>
            <ul className="border-t border-[var(--border-subtle)]">
              {match.items.map((item) => (
                <li key={item.id}>
                  <ItemRow
                    item={item}
                    binId={match.bin_id}
                    canWrite={canWrite}
                    isTrashed={!!match.is_trashed}
                    onOpenBin={(id) => onBinClick(id, match.is_trashed)}
                    selected={selection?.isSelected(item.id) ?? false}
                    onToggleSelect={
                      selection
                        ? () => selection.toggleItem(item.id, match.bin_id, item.name)
                        : undefined
                    }
                    externallyRemoved={removedItemIds?.has(item.id) ?? false}
                  />
                </li>
              ))}
            </ul>
            {selection &&
              canWrite &&
              !match.is_trashed &&
              !selection.isBinFullySelected(match.bin_id) &&
              selection.isAnySelectedInBin(match.bin_id) && (
                <button
                  type="button"
                  onClick={() => selection.selectAllInBin(match.bin_id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] border-t border-[var(--border-subtle)] transition-colors"
                >
                  <CheckSquare className="h-4 w-4 shrink-0" />
                  <span>
                    {t('itemQuery.selectAllPrefix', { defaultValue: 'Select all' })} {match.items.length}{' '}
                    {plural(
                      match.items.length,
                      t('itemQuery.item', { defaultValue: 'item' }),
                      t('itemQuery.items', { defaultValue: 'items' }),
                    )}
                  </span>
                </button>
              )}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => onBinClick(match.bin_id, match.is_trashed)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] border-t border-[var(--border-subtle)] transition-colors"
              >
                <span className="flex-1 text-left">
                  + {hiddenCount}{' '}
                  {t('itemQuery.moreItemsSuffix', {
                    defaultValue: 'more {{word}} — open bin to see all',
                    word: plural(
                      hiddenCount,
                      t('itemQuery.item', { defaultValue: 'item' }),
                      t('itemQuery.items', { defaultValue: 'items' }),
                    ),
                  })}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
