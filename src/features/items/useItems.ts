import { useAuth } from '@/lib/auth';
import { Events } from '@/lib/eventBus';
import { usePaginatedList } from '@/lib/usePaginatedList';

export interface ItemEntry {
  id: string;
  name: string;
  quantity: number | null;
  bin_id: string | null;
  bin_name: string | null;
  bin_icon: string | null;
  bin_color: string | null;
  area_id: string | null;
  area_name: string | null;
}

/** Server-side item filters. `areaId` and `unassigned` are mutually exclusive (the API answers 422 to both). */
export interface ItemFilters {
  areaId?: string | null;
  unassigned?: boolean;
  /** Only items that are not in a box. */
  loose?: boolean;
}

export function usePaginatedItemList(
  search?: string,
  sort?: string,
  order?: 'asc' | 'desc',
  filters?: ItemFilters,
  pageSize = 40,
) {
  const { activeLocationId } = useAuth();

  let basePath: string | null = null;
  if (activeLocationId) {
    const params = new URLSearchParams({ location_id: activeLocationId });
    if (search?.trim()) {
      params.set('q', search.trim());
    }
    if (sort && sort !== 'alpha') {
      params.set('sort', sort);
    }
    if (order === 'desc') {
      params.set('sort_dir', 'desc');
    }
    if (filters?.areaId && !filters.unassigned) params.set('area_id', filters.areaId);
    if (filters?.unassigned) params.set('unassigned', 'true');
    if (filters?.loose) params.set('loose', 'true');
    basePath = `/api/items?${params.toString()}`;
  }

  const result = usePaginatedList<ItemEntry>(basePath, [Events.BINS], pageSize);

  return {
    items: result.items,
    totalCount: result.totalCount,
    isLoading: result.isLoading,
    isLoadingMore: result.isLoadingMore,
    hasMore: result.hasMore,
    loadMore: result.loadMore,
  };
}
