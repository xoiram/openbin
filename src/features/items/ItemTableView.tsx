import { ArrowRightLeft, FolderTree, PackageMinus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ActionMenu, MenuDivider, MenuItem } from '@/components/ui/action-menu';
import { BinIconBadge } from '@/components/ui/bin-icon-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Highlight } from '@/components/ui/highlight';
import { LoadMoreSentinel } from '@/components/ui/load-more-sentinel';
import { type SortDirection, SortHeader } from '@/components/ui/sort-header';
import { Table, TableHeader, TableRow } from '@/components/ui/table';
import { useEntitySelectionInteraction } from '@/lib/bulk/useEntitySelectionInteraction';
import { resolveColor } from '@/lib/colorPalette';
import { resolveIcon } from '@/lib/iconMap';
import { cn } from '@/lib/utils';
import type { ItemEntry } from './useItems';

export type ItemSortColumn = 'alpha' | 'bin' | 'qty';

/** Per-row actions (writers only). Passing this adds an action menu to every row. */
export interface ItemRowActionHandlers {
  onEdit: (entry: ItemEntry) => void;
  onCheckout: (entry: ItemEntry) => void;
  onMove: (entry: ItemEntry) => void;
  onDelete: (entry: ItemEntry) => void;
}

interface ItemTableViewProps {
  items: ItemEntry[];
  sortColumn: ItemSortColumn;
  sortDirection: SortDirection;
  onSortChange: (column: ItemSortColumn, direction: SortDirection) => void;
  searchQuery: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, index: number, shiftKey: boolean) => void;
  rowActions?: ItemRowActionHandlers;
}

export function ItemTableView({
  items,
  sortColumn,
  sortDirection,
  onSortChange,
  searchQuery,
  hasMore,
  isLoadingMore,
  loadMore,
  selectable,
  selectedIds,
  onSelect,
  rowActions,
}: ItemTableViewProps) {
  const { t } = useTranslation('items');

  return (
    <>
      <Table>
        {/* Header */}
        <TableHeader>
          <span className="w-6 shrink-0" aria-hidden />
          <SortHeader label={t('table.item', { defaultValue: 'Item' })} column="alpha" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSortChange} className="flex-[2]" />
          <SortHeader label={t('table.qty', { defaultValue: 'Qty' })} column="qty" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSortChange} defaultDirection="desc" className="w-14 justify-end" />
          <SortHeader label={t('looseItems.table.location', { defaultValue: 'Stored in' })} column="bin" currentColumn={sortColumn} currentDirection={sortDirection} onSort={onSortChange} className="flex-1" />
          {rowActions && <span className="w-11 shrink-0" aria-hidden />}
        </TableHeader>

        {/* Rows */}
        {items.map((entry, index) => (
          <ItemRow
            key={entry.id}
            entry={entry}
            index={index}
            searchQuery={searchQuery}
            selectable={selectable}
            selected={selectedIds?.has(entry.id) ?? false}
            onSelect={onSelect}
            rowActions={rowActions}
          />
        ))}
      </Table>
      <LoadMoreSentinel hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
    </>
  );
}

function ItemRow({
  entry,
  index,
  searchQuery,
  selectable,
  selected,
  onSelect,
  rowActions,
}: {
  entry: ItemEntry;
  index: number;
  searchQuery: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string, index: number, shiftKey: boolean) => void;
  rowActions?: ItemRowActionHandlers;
}) {
  const { t } = useTranslation('items');
  const navigate = useNavigate();
  const { handleClick, handleKeyDown, longPress } = useEntitySelectionInteraction({
    id: entry.id,
    index,
    selectable,
    onSelect,
    onActivate: () => {
      // Items without a box have nowhere to navigate to.
      if (!entry.bin_id) return;
      navigate(`/bin/${entry.bin_id}`, { state: { backLabel: t('page.title', { defaultValue: 'Items' }), backPath: '/items' } });
    },
  });
  const hasBin = entry.bin_id != null;
  const BinIcon = resolveIcon(entry.bin_icon ?? '');
  const colorPreset = resolveColor(entry.bin_color ?? '');
  const unassignedLabel = t('table.unassigned', { defaultValue: 'Unassigned' });
  const placeName = entry.bin_name ?? entry.area_name;
  const placeLabel = placeName ?? unassignedLabel;
  let ariaLabel: string;
  if (entry.quantity != null) {
    ariaLabel = placeName
      ? t('table.rowLabelWithQuantity', { defaultValue: '{{name}} ({{quantity}}) in {{bin}}', name: entry.name, quantity: entry.quantity, bin: placeName })
      : t('table.rowLabelWithQuantityUnassigned', { defaultValue: '{{name}} ({{quantity}}), unassigned', name: entry.name, quantity: entry.quantity });
  } else {
    ariaLabel = placeName
      ? t('table.rowLabel', { defaultValue: '{{name}} in {{bin}}', name: entry.name, bin: placeName })
      : t('table.rowLabelUnassigned', { defaultValue: '{{name}}, unassigned', name: entry.name });
  }

  return (
    <TableRow
      tabIndex={0}
      role={selectable ? 'option' : hasBin ? 'button' : 'row'}
      aria-selected={selectable ? selected : undefined}
      aria-label={ariaLabel}
      className={cn(!hasBin && !selectable && 'cursor-default')}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchMove={longPress.onTouchMove}
      onContextMenu={longPress.onContextMenu}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stops row click bubbling */}
      <div
        className={cn('shrink-0 mr-2 transition-opacity', !selectable && !selected && 'opacity-40')}
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <Checkbox
          checked={selected ?? false}
          onCheckedChange={() => onSelect?.(entry.id, index, false)}
        />
      </div>
      <div className="flex-[2] min-w-0">
        <span className="truncate font-medium text-[14px] text-[var(--text-primary)]">
          <Highlight text={entry.name} query={searchQuery} />
        </span>
      </div>
      <span className="w-14 shrink-0 text-[13px] tabular-nums text-[var(--text-tertiary)] text-right">
        {entry.quantity != null ? entry.quantity : '—'}
      </span>
      <div className="flex-1 min-w-0 row" data-testid="item-location">
        {hasBin && <BinIconBadge icon={BinIcon} colorPreset={colorPreset} />}
        {!hasBin && entry.area_id && <FolderTree className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
        <span className={cn('truncate text-[13px] text-[var(--text-tertiary)]', !placeName && 'italic')}>
          <Highlight text={placeLabel} query={searchQuery} />
        </span>
      </div>
      {rowActions && (
        // biome-ignore lint/a11y/noStaticElementInteractions: keeps menu clicks/keys from activating the row
        <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <ItemRowMenu entry={entry} actions={rowActions} />
        </div>
      )}
    </TableRow>
  );
}

function ItemRowMenu({ entry, actions }: { entry: ItemEntry; actions: ItemRowActionHandlers }) {
  const { t } = useTranslation(['items', 'common']);
  return (
    <ActionMenu
      triggerAriaLabel={t('looseItems.actions.menuLabel', { defaultValue: 'Item actions' })}
      triggerClassName="shrink-0 flex items-center justify-center size-11 -my-2 -mr-2 text-[var(--text-tertiary)] transition-opacity opacity-30 lg:opacity-0 lg:group-hover:opacity-100 aria-expanded:opacity-100"
      menuClassName="min-w-[160px]"
    >
      <MenuItem icon={Pencil} label={t('looseItems.actions.edit', { defaultValue: 'Edit' })} onClick={() => actions.onEdit(entry)} />
      <MenuItem icon={PackageMinus} label={t('looseItems.actions.checkout', { defaultValue: 'Check out' })} onClick={() => actions.onCheckout(entry)} />
      <MenuItem icon={ArrowRightLeft} label={t('looseItems.actions.move', { defaultValue: 'Move…' })} onClick={() => actions.onMove(entry)} />
      <MenuDivider />
      <MenuItem icon={Trash2} label={t('common:actions.delete', { defaultValue: 'Delete' })} onClick={() => actions.onDelete(entry)} destructive />
    </ActionMenu>
  );
}
