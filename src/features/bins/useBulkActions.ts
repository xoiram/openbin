import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { pinBin, unpinBin } from '@/features/pins/usePins';
import { useAuth } from '@/lib/auth';
import type { Terminology } from '@/lib/terminology';
import { haptic } from '@/lib/utils';
import type { Bin } from '@/types';
import { addBin, deleteBin, restoreBin } from './useBins';

export function useBulkActions(
  bins: Bin[],
  selectedIds: Set<string>,
  clearSelection: () => void,
  showToast: (toast: { message: string; action?: { label: string; onClick: () => void } }) => void,
  term: Terminology,
) {
  const { t } = useTranslation('bins');
  const { activeLocationId } = useAuth();
  const navigate = useNavigate();
  const [isBusy, setIsBusy] = useState(false);
  const selected = useMemo(
    () => bins.filter((b) => selectedIds.has(b.id)),
    [bins, selectedIds],
  );

  const majorityUnpinned = useMemo(
    () => selected.filter((b) => !b.is_pinned).length >= selected.length / 2,
    [selected],
  );

  const pinLabel = majorityUnpinned ? t('bulk.pin', { defaultValue: 'Pin' }) : t('bulk.unpin', { defaultValue: 'Unpin' });

  const bulkDelete = useCallback(async () => {
    setIsBusy(true);
    try {
      // A box inside a selected box is trashed together with its parent; deleting it again would fail.
      const toDelete = selected.filter((b) => !(b.parent_bin_id && selectedIds.has(b.parent_bin_id)));
      const snapshots: Bin[] = toDelete.map((b) => ({ ...b }));
      await Promise.all(toDelete.map((b) => deleteBin(b.id)));
      haptic([50, 30, 50]);
      clearSelection();
      showToast({
        message: t('bulk.deleted', {
          count: selected.length,
          defaultValue_one: 'Deleted {{count}} {{bin}}',
          defaultValue_other: 'Deleted {{count}} {{bins}}',
          bin: term.bin,
          bins: term.bins,
        }),
        action: {
          label: t('bulk.undo', { defaultValue: 'Undo' }),
          onClick: async () => {
            for (const bin of snapshots) {
              await restoreBin(bin);
            }
          },
        },
      });
    } finally {
      setIsBusy(false);
    }
  }, [selected, selectedIds, clearSelection, showToast, t, term]);

  const bulkPinToggle = useCallback(async () => {
    setIsBusy(true);
    try {
      if (majorityUnpinned) {
        await Promise.all(selected.filter((b) => !b.is_pinned).map((b) => pinBin(b.id)));
      } else {
        await Promise.all(selected.filter((b) => b.is_pinned).map((b) => unpinBin(b.id)));
      }
      clearSelection();
    } finally {
      setIsBusy(false);
    }
  }, [selected, majorityUnpinned, clearSelection]);

  const bulkDuplicate = useCallback(async () => {
    if (!activeLocationId) return;
    setIsBusy(true);
    try {
      const ids: string[] = [];
      for (const bin of selected) {
        const newBin = await addBin({
          name: `${bin.name} (copy)`,
          locationId: activeLocationId,
          items: bin.items.map((i) => i.name),
          notes: bin.notes,
          tags: [...bin.tags],
          // A child's copy stays beside it; the server gives it the parent's area.
          areaId: bin.area_id,
          parentBinId: bin.parent_bin_id ?? null,
          icon: bin.icon,
          color: bin.color,
          cardStyle: bin.card_style,
          visibility: bin.visibility,
          customFields: bin.custom_fields ? { ...bin.custom_fields } : undefined,
        });
        ids.push(newBin.id);
      }
      clearSelection();
      if (ids.length === 1) {
        navigate(`/bin/${ids[0]}`);
        showToast({ message: t('bulk.duplicatedOne', { defaultValue: 'Duplicated "{{name}}"', name: selected[0].name }) });
      } else {
        showToast({ message: t('bulk.duplicatedMany', { defaultValue: 'Duplicated {{count}} {{bins}}', count: ids.length, bins: term.bins }) });
      }
    } finally {
      setIsBusy(false);
    }
  }, [selected, activeLocationId, clearSelection, showToast, navigate, t, term]);

  // Boxes that would be trashed along with the selection and aren't selected themselves.
  const selectedChildCount = useMemo(() => {
    const inside = selected.reduce((n, b) => n + (b.child_count ?? 0), 0);
    const alreadySelected = selected.filter((b) => b.parent_bin_id && selectedIds.has(b.parent_bin_id)).length;
    return Math.max(0, inside - alreadySelected);
  }, [selected, selectedIds]);

  return { selectedChildCount, bulkDelete, bulkPinToggle, bulkDuplicate, pinLabel, isBusy };
}
