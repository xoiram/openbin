import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Bin } from '@/types';

interface BinSelectionOptions {
  /** Only top-level bins (no parent box) can be selected: select-all, toggle-area and `?ids=` all skip children. */
  topLevelOnly?: boolean;
}

export function useBinSelection(allBins: Bin[], options?: BinSelectionOptions) {
  const topLevelOnly = options?.topLevelOnly ?? false;
  const [searchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectable = useMemo(
    () => (topLevelOnly ? allBins.filter((b) => !b.parent_bin_id) : allBins),
    [allBins, topLevelOnly],
  );
  const selectableIds = useMemo(() => new Set(selectable.map((b) => b.id)), [selectable]);

  // Deep link: with topLevelOnly, ids are filtered against the loaded top-level bins (applied once per ?ids= value,
  // after the list has loaded, so later list refreshes do not reset the user's selection).
  const idsParam = searchParams.get('ids');
  const appliedIdsParam = useRef<string | null>(null);
  useEffect(() => {
    if (!idsParam) return;
    if (!topLevelOnly) {
      setSelectedIds(new Set(idsParam.split(',')));
      return;
    }
    if (allBins.length === 0 || appliedIdsParam.current === idsParam) return;
    appliedIdsParam.current = idsParam;
    setSelectedIds(new Set(idsParam.split(',').filter((id) => selectableIds.has(id))));
  }, [idsParam, topLevelOnly, allBins.length, selectableIds]);

  const selectedBins = useMemo(
    () => selectable.filter((b) => selectedIds.has(b.id)),
    [selectable, selectedIds],
  );

  function toggleBin(id: string) {
    if (topLevelOnly && !selectableIds.has(id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(selectable.map((b) => b.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  function toggleArea(areaId: string | null) {
    const areaIds = selectable.filter((b) => b.area_id === areaId).map((b) => b.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (areaIds.every((id) => prev.has(id))) {
        for (const id of areaIds) next.delete(id);
      } else {
        for (const id of areaIds) next.add(id);
      }
      return next;
    });
  }

  return { selectedIds, selectedBins, toggleBin, selectAll, selectNone, toggleArea };
}
