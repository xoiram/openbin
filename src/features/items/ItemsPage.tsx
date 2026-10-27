import { ArrowRightLeft, ClipboardList, Hash, PackageOpen, Plus, Sparkles, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Crossfade } from '@/components/ui/crossfade';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/ui/skeleton-list';
import { useToast } from '@/components/ui/toast';
import { type BulkAction, BulkActionBar } from '@/lib/bulk/BulkActionBar';
import { useBulkSelection } from '@/lib/bulk/useBulkSelection';
import { useTerminology } from '@/lib/terminology';
import { useDebounce } from '@/lib/useDebounce';
import { useMountOnOpen } from '@/lib/useMountOnOpen';
import { usePermissions } from '@/lib/usePermissions';
import { useTableSearchParams } from '@/lib/useTableSearchParams';
import { cn } from '@/lib/utils';
import { AddItemDialog } from './AddItemDialog';
import { DeleteItemDialog } from './DeleteItemDialog';
import { EditItemDialog } from './EditItemDialog';
import { ItemFilterBar } from './ItemFilterBar';
import { type ItemRowActionHandlers, type ItemSortColumn, ItemTableView } from './ItemTableView';
import { useItemBulkActions } from './useItemBulkActions';
import { useItemFilters } from './useItemFilters';
import { useItemRowActions } from './useItemRowActions';
import { usePaginatedItemList } from './useItems';

const BulkDeleteItemsDialog = lazy(() =>
  import('./BulkDeleteItemsDialog').then((m) => ({ default: m.BulkDeleteItemsDialog })),
);
const BulkCheckoutItemsDialog = lazy(() =>
  import('./BulkCheckoutItemsDialog').then((m) => ({ default: m.BulkCheckoutItemsDialog })),
);
const BulkMoveItemsDialog = lazy(() =>
  import('./BulkMoveItemsDialog').then((m) => ({ default: m.BulkMoveItemsDialog })),
);
const BulkQuantityDialog = lazy(() =>
  import('./BulkQuantityDialog').then((m) => ({ default: m.BulkQuantityDialog })),
);

export function ItemsPage() {
  const { t } = useTranslation(['items', 'common']);
  const term = useTerminology();
  const { search, sortColumn, sortDirection, setSearch, setSort } = useTableSearchParams<ItemSortColumn>('alpha');
  const debouncedSearch = useDebounce(search, 300);
  const { filters, hasFilters, setAreaId, setUnassigned, setLoose, clearFilters } = useItemFilters();
  const { items, totalCount, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedItemList(
    debouncedSearch,
    sortColumn,
    sortDirection,
    filters,
  );

  const { showToast } = useToast();
  const { canWrite } = usePermissions();
  const { selectedIds, selectable, toggleSelect, clearSelection } = useBulkSelection({
    items,
    resetDeps: [debouncedSearch, sortColumn, sortDirection, filters],
  });
  const { bulkDelete, bulkCheckout, bulkMove, bulkQuantity, isBusy } = useItemBulkActions(clearSelection, showToast);

  const rowActions = useItemRowActions(showToast);
  const rowHandlers: ItemRowActionHandlers | undefined = canWrite
    ? {
        onEdit: rowActions.setEditing,
        onCheckout: rowActions.checkout,
        onMove: rowActions.setMoving,
        onDelete: rowActions.setDeleting,
      }
    : undefined;

  // Deep link: `?add=1` (optionally with `area_id`) opens the Add item dialog once, then drops `add`.
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addAreaId, setAddAreaId] = useState<string | null>(null);
  const wantsAdd = searchParams.get('add') === '1';
  useEffect(() => {
    // Viewers can't add items; leave the URL alone until we know the user can (permissions may still be loading).
    if (!wantsAdd || !canWrite) return;
    setAddAreaId(searchParams.get('area_id') || null);
    setAddOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('add');
      return next;
    }, { replace: true });
  }, [wantsAdd, canWrite, searchParams, setSearchParams]);

  const [openDialog, setOpenDialog] = useState<'delete' | 'checkout' | 'move' | 'quantity' | null>(null);
  const deleteMounted = useMountOnOpen(openDialog === 'delete');
  const checkoutMounted = useMountOnOpen(openDialog === 'checkout');
  const moveMounted = useMountOnOpen(openDialog === 'move');
  const quantityMounted = useMountOnOpen(openDialog === 'quantity');

  const ids = [...selectedIds];

  const actions: BulkAction[] = [
    { id: 'delete', icon: Trash2, label: t('common:actions.delete', { defaultValue: 'Delete' }), onClick: () => setOpenDialog('delete'), group: 'primary', danger: true },
    { id: 'checkout', icon: Sparkles, label: t('page.bulk.checkout', { defaultValue: 'Checkout' }), onClick: () => setOpenDialog('checkout'), group: 'primary' },
    { id: 'move', icon: ArrowRightLeft, label: t('page.bulk.move', { defaultValue: 'Move' }), onClick: () => setOpenDialog('move'), group: 'more' },
    { id: 'quantity', icon: Hash, label: t('page.bulk.setQuantity', { defaultValue: 'Set quantity' }), onClick: () => setOpenDialog('quantity'), group: 'more' },
  ];

  return (
    <div className="page-content-wide">
      <PageHeader
        title={t('page.title', { defaultValue: 'Items' })}
        actions={canWrite ? (
          <Button size="sm" onClick={() => { setAddAreaId(null); setAddOpen(true); }}>
            <Plus className="h-4 w-4" />
            {t('looseItems.add.button', { defaultValue: 'Add item' })}
          </Button>
        ) : undefined}
      />

      {(totalCount > 0 || search || hasFilters) && (
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={search ? () => setSearch('') : undefined}
          placeholder={t('page.searchPlaceholder', { defaultValue: 'Search items...' })}
        />
      )}

      {(totalCount > 0 || search || hasFilters) && (
        <ItemFilterBar
          filters={filters}
          hasFilters={hasFilters}
          onAreaChange={setAreaId}
          onUnassignedChange={setUnassigned}
          onLooseChange={setLoose}
          onClear={clearFilters}
        />
      )}

      <Crossfade
        isLoading={isLoading && items.length === 0}
        skeleton={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full rounded-[var(--radius-sm)]" />
            <div className="flat-card rounded-[var(--radius-md)] overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-hover)]">
                <Skeleton className="h-4 w-10 flex-[2]" />
                <Skeleton className="h-4 w-8 shrink-0" />
                <Skeleton className="h-4 w-8 flex-1" />
              </div>
              <SkeletonList count={6} className="gap-0">
                {(i) => (
                  <div className={cn('px-3 py-2.5 flex items-center gap-3', i < 5 && 'border-b border-[var(--border-subtle)]')}>
                    <Skeleton className={cn('h-4 flex-[2]', i % 3 === 0 ? 'w-2/3' : i % 3 === 1 ? 'w-1/2' : 'w-3/5')} />
                    <Skeleton className="h-4 w-6 shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <Skeleton className="h-5 w-5 rounded-[var(--radius-xs)] shrink-0" />
                      <Skeleton className={cn('h-4', i % 2 === 0 ? 'w-1/2' : 'w-2/5')} />
                    </div>
                  </div>
                )}
              </SkeletonList>
            </div>
          </div>
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon={search || hasFilters ? ClipboardList : PackageOpen}
            title={hasFilters
              ? t('looseItems.empty.filteredTitle', { defaultValue: 'No items match these filters' })
              : search
                ? t('page.empty.noMatchesTitle', { defaultValue: 'No items match your search' })
                : t('page.empty.title', { defaultValue: 'No items yet' })}
            subtitle={hasFilters
              ? t('looseItems.empty.filteredSubtitle', { defaultValue: 'Try removing a filter' })
              : search
                ? t('page.empty.noMatchesSubtitle', { defaultValue: 'Try a different search term' })
                : t('page.empty.subtitle', { defaultValue: 'Items added to {{bins}} will appear here', bins: term.bins })}
            variant={search || hasFilters ? 'search' : undefined}
          >
            {hasFilters && (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                {t('looseItems.filters.clear', { defaultValue: 'Clear filters' })}
              </Button>
            )}
            {!search && !hasFilters && (
              <Link to="/bins">
                <Button variant="secondary" size="sm">
                  {t('page.empty.browse', { defaultValue: 'Browse {{bins}}', bins: term.bins })}
                </Button>
              </Link>
            )}
          </EmptyState>
        ) : (
          <div className={cn(selectable && 'pb-16')}>
            <ItemTableView
              items={items}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSortChange={setSort}
              searchQuery={debouncedSearch}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              loadMore={loadMore}
              selectable={selectable}
              selectedIds={selectedIds}
              onSelect={toggleSelect}
              rowActions={rowHandlers}
            />
          </div>
        )}
      </Crossfade>

      {selectable && canWrite && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          onClear={clearSelection}
          isBusy={isBusy}
          actions={actions}
          selectionLabel={t('page.selectionLabel', {
            count: selectedIds.size,
            defaultValue_one: '{{count}} item selected',
            defaultValue_other: '{{count}} items selected',
          })}
        />
      )}

      {canWrite && (
        <>
          <AddItemDialog open={addOpen} onOpenChange={setAddOpen} initialAreaId={addAreaId} />
          <EditItemDialog
            entry={rowActions.editing}
            onOpenChange={(v) => !v && rowActions.setEditing(null)}
            onSave={rowActions.save}
          />
          <DeleteItemDialog
            entry={rowActions.deleting}
            onOpenChange={(v) => !v && rowActions.setDeleting(null)}
            onConfirm={rowActions.remove}
          />
        </>
      )}
      {deleteMounted && (
        <Suspense fallback={null}>
          <BulkDeleteItemsDialog
            open={openDialog === 'delete'}
            onOpenChange={(v) => (v ? setOpenDialog('delete') : setOpenDialog(null))}
            count={selectedIds.size}
            onConfirm={() => bulkDelete(ids)}
          />
        </Suspense>
      )}
      {checkoutMounted && (
        <Suspense fallback={null}>
          <BulkCheckoutItemsDialog
            open={openDialog === 'checkout'}
            onOpenChange={(v) => (v ? setOpenDialog('checkout') : setOpenDialog(null))}
            count={selectedIds.size}
            onConfirm={() => bulkCheckout(ids)}
          />
        </Suspense>
      )}
      {moveMounted && (
        <Suspense fallback={null}>
          <BulkMoveItemsDialog
            open={openDialog === 'move'}
            onOpenChange={(v) => (v ? setOpenDialog('move') : setOpenDialog(null))}
            selectedIds={ids}
            onApply={bulkMove}
          />
        </Suspense>
      )}
      {rowActions.moving && (
        <Suspense fallback={null}>
          <BulkMoveItemsDialog
            open
            onOpenChange={(v) => !v && rowActions.setMoving(null)}
            selectedIds={[rowActions.moving.id]}
            onApply={(moveIds, target, name) => bulkMove(moveIds, target, name)}
          />
        </Suspense>
      )}
      {quantityMounted && (
        <Suspense fallback={null}>
          <BulkQuantityDialog
            open={openDialog === 'quantity'}
            onOpenChange={(v) => (v ? setOpenDialog('quantity') : setOpenDialog(null))}
            selectedIds={ids}
            onApply={bulkQuantity}
          />
        </Suspense>
      )}
    </div>
  );
}
