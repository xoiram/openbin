import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ItemFilters } from './useItems';

/**
 * URL-backed item filters: `area_id`, `unassigned=true` and `loose=true`, so the Items page can be
 * deep-linked and restored on reload. `area_id` and `unassigned` exclude each other (the server rejects both).
 */
export function useItemFilters() {
  const [params, setParams] = useSearchParams();

  const unassigned = params.get('unassigned') === 'true';
  // Unassigned wins if a hand-written URL carries both.
  const areaId = unassigned ? null : params.get('area_id') || null;
  const loose = params.get('loose') === 'true';

  const filters: ItemFilters = useMemo(() => ({ areaId, unassigned, loose }), [areaId, unassigned, loose]);

  const update = useCallback((mutate: (next: URLSearchParams) => void) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      mutate(next);
      return next;
    }, { replace: true });
  }, [setParams]);

  /** Show items in this area (null clears the area filter). Clears "unassigned". */
  const setAreaId = useCallback((id: string | null) => update((next) => {
    next.delete('unassigned');
    if (id) next.set('area_id', id);
    else next.delete('area_id');
  }), [update]);

  /** Show items in no area. Clears the area filter. */
  const setUnassigned = useCallback((on: boolean) => update((next) => {
    next.delete('area_id');
    if (on) next.set('unassigned', 'true');
    else next.delete('unassigned');
  }), [update]);

  const setLoose = useCallback((on: boolean) => update((next) => {
    if (on) next.set('loose', 'true');
    else next.delete('loose');
  }), [update]);

  const clearFilters = useCallback(() => update((next) => {
    next.delete('area_id');
    next.delete('unassigned');
    next.delete('loose');
  }), [update]);

  const hasFilters = Boolean(areaId) || unassigned || loose;

  return { filters, hasFilters, setAreaId, setUnassigned, setLoose, clearFilters };
}
