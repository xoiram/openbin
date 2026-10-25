import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { Events, notify } from '@/lib/eventBus';
import { useTerminology } from '@/lib/terminology';


type ToastFn = (toast: { message: string; variant?: 'error' | 'success' }) => void;

export function useTagBulkActions(locationId: string | null, clearSelection: () => void, showToast: ToastFn) {
  const { t } = useTranslation('tags');
  const term = useTerminology();
  const [isBusy, setIsBusy] = useState(false);
  const tagCount = useCallback(
    (count: number) => t('bulk.tagCount', { count, defaultValue_one: '{{count}} tag', defaultValue_other: '{{count}} tags' }),
    [t],
  );
  const binCount = useCallback(
    (count: number) => t('bulk.binCount', { count, defaultValue_one: '{{count}} {{bin}}', defaultValue_other: '{{count}} {{bins}}', bin: term.bin, bins: term.bins }),
    [t, term],
  );

  function notifyTagsChanged() {
    notify(Events.BINS);
    notify(Events.TAG_COLORS);
  }

  const bulkDelete = useCallback(
    async (tags: string[]) => {
      if (!locationId) return;
      setIsBusy(true);
      try {
        const { tagsDeleted, binsUpdated } = await apiFetch<{ tagsDeleted: number; binsUpdated: number; orphanedChildren: number }>(
          '/api/tags/bulk-delete',
          { method: 'POST', body: { locationId, tags } },
        );
        notifyTagsChanged();
        clearSelection();
        showToast({
          message: t('bulk.deleted', {
            defaultValue: 'Deleted {{tags}} from {{bins}}',
            tags: tagCount(tagsDeleted),
            bins: binCount(binsUpdated),
          }),
        });
      } finally {
        setIsBusy(false);
      }
    },
    [locationId, clearSelection, showToast, t, tagCount, binCount],
  );

  const bulkSetParent = useCallback(
    async (tags: string[], parentTag: string | null) => {
      if (!locationId) return;
      setIsBusy(true);
      try {
        const { tagsUpdated } = await apiFetch<{ tagsUpdated: number }>(
          '/api/tags/bulk-set-parent',
          { method: 'POST', body: { locationId, tags, parentTag } },
        );
        notifyTagsChanged();
        clearSelection();
        showToast({
          message: parentTag
            ? t('bulk.parentSet', { defaultValue: 'Set parent for {{tags}}', tags: tagCount(tagsUpdated) })
            : t('bulk.parentCleared', { defaultValue: 'Cleared parent for {{tags}}', tags: tagCount(tagsUpdated) }),
        });
      } finally {
        setIsBusy(false);
      }
    },
    [locationId, clearSelection, showToast, t, tagCount],
  );

  const bulkSetColor = useCallback(
    async (tags: string[], color: string) => {
      if (!locationId) return;
      setIsBusy(true);
      try {
        const { tagsUpdated } = await apiFetch<{ tagsUpdated: number }>(
          '/api/tags/bulk-set-color',
          { method: 'POST', body: { locationId, tags, color } },
        );
        notifyTagsChanged();
        clearSelection();
        showToast({ message: t('bulk.colorSet', { defaultValue: 'Set color for {{tags}}', tags: tagCount(tagsUpdated) }) });
      } finally {
        setIsBusy(false);
      }
    },
    [locationId, clearSelection, showToast, t, tagCount],
  );

  const bulkMerge = useCallback(
    async (fromTags: string[], toTag: string) => {
      if (!locationId) return;
      setIsBusy(true);
      try {
        const { binsUpdated } = await apiFetch<{ tagsMerged: number; binsUpdated: number; childrenReassigned: number }>(
          '/api/tags/bulk-merge',
          { method: 'POST', body: { locationId, fromTags, toTag } },
        );
        notifyTagsChanged();
        clearSelection();
        showToast({
          message: t('bulk.merged', {
            defaultValue: 'Merged {{tags}} into "{{target}}" across {{bins}}',
            tags: tagCount(fromTags.length),
            target: toTag,
            bins: binCount(binsUpdated),
          }),
        });
      } finally {
        setIsBusy(false);
      }
    },
    [locationId, clearSelection, showToast, t, tagCount, binCount],
  );

  return { bulkDelete, bulkSetParent, bulkSetColor, bulkMerge, isBusy };
}
